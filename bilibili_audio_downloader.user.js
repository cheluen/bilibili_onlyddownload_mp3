// ==UserScript==
// @name         Bilibili音频下载器
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  从B站视频中提取音频并下载为MP3格式
// @author       cheluen
// @match        *://www.bilibili.com/video/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @connect      api.bilibili.com
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // 样式设置
    const style = document.createElement('style');
    style.textContent = `
        .bili-audio-download-btn {
            background-color: #fb7299;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 5px 12px;
            font-size: 14px;
            cursor: pointer;
            margin-left: 10px;
            transition: background-color 0.3s;
        }
        .bili-audio-download-btn:hover {
            background-color: #fc8bab;
        }
        .bili-audio-download-status {
            margin-left: 10px;
            color: #666;
            font-size: 14px;
        }
    `;
    document.head.appendChild(style);

    // 标记按钮是否已添加
    let buttonAdded = false;
    let currentUrl = '';

    // 添加下载按钮
    function addDownloadButton() {
        // 检查URL是否变化，如果变化则重置按钮状态
        if (currentUrl !== window.location.href) {
            currentUrl = window.location.href;
            buttonAdded = false;
            // 移除旧按钮
            const oldBtn = document.querySelector('.bili-audio-download-btn');
            const oldStatus = document.querySelector('.bili-audio-download-status');
            if (oldBtn) oldBtn.remove();
            if (oldStatus) oldStatus.remove();
        }

        // 如果按钮已添加，则不再重复添加
        if (buttonAdded) return;

        // 等待视频信息加载完成
        const checkInterval = setInterval(() => {
            // 更新的选择器，适配新版B站页面
            const titleElement = document.querySelector('h1[data-title]') ||
                                document.querySelector('.video-title') ||
                                document.querySelector('h1.video-title');

            if (titleElement) {
                clearInterval(checkInterval);

                // 查找合适的位置添加按钮，使用更准确的选择器
                const actionBar = document.querySelector('.video-toolbar-left') ||
                                  document.querySelector('.toolbar-left') ||
                                  document.querySelector('.video-info-detail-list') ||
                                  document.querySelector('.video-desc');

                if (actionBar) {
                    // 创建按钮容器
                    const buttonContainer = document.createElement('div');
                    buttonContainer.style.cssText = 'display: inline-flex; align-items: center; margin: 10px 0;';

                    const downloadBtn = document.createElement('button');
                    downloadBtn.className = 'bili-audio-download-btn';
                    downloadBtn.textContent = '下载音频(MP3)';
                    downloadBtn.onclick = startAudioDownload;

                    const statusSpan = document.createElement('span');
                    statusSpan.className = 'bili-audio-download-status';
                    statusSpan.style.display = 'none';

                    buttonContainer.appendChild(downloadBtn);
                    buttonContainer.appendChild(statusSpan);
                    actionBar.appendChild(buttonContainer);

                    // 标记按钮已添加
                    buttonAdded = true;
                }
            }
        }, 1000);

        // 设置超时，避免无限等待
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 10000);
    }

    // 获取视频信息
    async function getVideoInfo() {
        const url = window.location.href;
        const bvidMatch = url.match(/\/video\/([^\/\?]+)/);

        if (!bvidMatch) {
            throw new Error('无法从URL中提取视频ID');
        }

        const bvid = bvidMatch[1];

        // 显示状态
        updateStatus('获取视频信息...');

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
                responseType: 'json',
                headers: {
                    'Referer': 'https://www.bilibili.com',
                    'User-Agent': navigator.userAgent
                },
                onload: function(response) {
                    if (response.status === 200 && response.response.code === 0) {
                        const data = response.response.data;

                        // 处理多分P视频
                        let selectedCid = data.cid;
                        if (data.pages && data.pages.length > 1) {
                            // 尝试从URL中获取当前分P
                            const pMatch = url.match(/[?&]p=(\d+)/);
                            if (pMatch) {
                                const pageNum = parseInt(pMatch[1]) - 1;
                                if (pageNum >= 0 && pageNum < data.pages.length) {
                                    selectedCid = data.pages[pageNum].cid;
                                }
                            }
                        }

                        resolve({
                            title: data.title,
                            cid: selectedCid,
                            bvid: data.bvid,
                            pages: data.pages || []
                        });
                    } else {
                        reject(`获取视频信息失败: ${response.response.message || '未知错误'}`);
                    }
                },
                onerror: function() {
                    reject('获取视频信息请求失败');
                }
            });
        });
    }

    // 获取音频URL
    async function getAudioUrl(bvid, cid) {
        updateStatus('获取音频地址...');

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16&fourk=1&qn=80`,
                responseType: 'json',
                headers: {
                    'Referer': 'https://www.bilibili.com',
                    'User-Agent': navigator.userAgent
                },
                onload: function(response) {
                    if (response.status === 200 && response.response.code === 0) {
                        const data = response.response.data;

                        // 尝试获取音频流URL
                        if (data.dash && data.dash.audio && data.dash.audio.length > 0) {
                            // 选择最高质量的音频
                            const audioStreams = data.dash.audio;
                            audioStreams.sort((a, b) => b.bandwidth - a.bandwidth);
                            const selectedAudio = audioStreams[0];

                            updateStatus(`找到音频流: ${Math.round(selectedAudio.bandwidth/1000)}kbps`);
                            resolve(selectedAudio.baseUrl || selectedAudio.base_url);
                        } else if (data.durl && data.durl.length > 0) {
                            // 兼容旧格式
                            resolve(data.durl[0].url);
                        } else {
                            reject('无法获取音频流地址，可能是版权受限视频');
                        }
                    } else {
                        reject(`获取音频地址失败: ${response.response.message || '未知错误'}`);
                    }
                },
                onerror: function() {
                    reject('获取音频地址请求失败');
                }
            });
        });
    }

    // 下载音频数据
    async function downloadAudioData(url) {
        updateStatus('下载音频数据...');
        
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                headers: {
                    'Referer': 'https://www.bilibili.com',
                    'User-Agent': navigator.userAgent
                },
                onload: function(response) {
                    if (response.status === 200) {
                        resolve(response.response);
                    } else {
                        reject('下载音频数据失败');
                    }
                },
                onerror: function() {
                    reject('下载音频数据请求失败');
                },
                onprogress: function(progress) {
                    if (progress.lengthComputable) {
                        const percent = Math.round((progress.loaded / progress.total) * 100);
                        updateStatus(`下载中: ${percent}%`);
                    }
                }
            });
        });
    }

    // 下载音频文件
    function downloadAudioFile(audioData, title) {
        updateStatus('准备下载...');

        try {
            // 创建Blob对象，保持原始音频格式
            const blob = new Blob([audioData], { type: 'audio/mp4' });

            // 清理文件名，移除非法字符
            const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

            // 使用GM_download下载文件
            GM_download({
                url: URL.createObjectURL(blob),
                name: `${safeTitle}.m4a`,
                onload: function() {
                    updateStatus('下载完成！', 3000);
                    // 清理URL对象
                    setTimeout(() => {
                        URL.revokeObjectURL(blob);
                    }, 5000);
                },
                onerror: function(error) {
                    updateStatus(`下载失败: ${error.message || error}`, 5000);
                    URL.revokeObjectURL(blob);
                }
            });
        } catch (error) {
            updateStatus(`下载失败: ${error.message}`, 5000);
            console.error('下载音频文件错误:', error);
        }
    }

    // 更新状态显示
    function updateStatus(message, hideAfter = 0) {
        const statusSpan = document.querySelector('.bili-audio-download-status');
        if (statusSpan) {
            statusSpan.textContent = message;
            statusSpan.style.display = 'inline';
            
            if (hideAfter > 0) {
                setTimeout(() => {
                    statusSpan.style.display = 'none';
                }, hideAfter);
            }
        }
    }

    // 开始下载流程
    async function startAudioDownload() {
        const downloadBtn = document.querySelector('.bili-audio-download-btn');

        try {
            // 禁用按钮防止重复点击
            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.textContent = '下载中...';
            }

            // 获取视频信息
            const videoInfo = await getVideoInfo();

            // 获取音频URL
            const audioUrl = await getAudioUrl(videoInfo.bvid, videoInfo.cid);

            // 下载音频数据
            const audioData = await downloadAudioData(audioUrl);

            // 下载音频文件
            downloadAudioFile(audioData, videoInfo.title);

        } catch (error) {
            updateStatus(`错误: ${error}`, 5000);
            console.error('Bilibili音频下载器错误:', error);
        } finally {
            // 恢复按钮状态
            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.textContent = '下载音频(MP3)';
            }
        }
    }

    // 使用一个统一的初始化函数
    function initScript() {
        addDownloadButton();
    }

    // 监听页面变化，支持SPA路由
    function observePageChanges() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                // URL变化时重新初始化
                setTimeout(initScript, 1000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    // 初始化脚本
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initScript();
            observePageChanges();
        });
    } else {
        initScript();
        observePageChanges();
    }
})();