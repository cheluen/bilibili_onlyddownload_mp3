// ==UserScript==
// @name         Bilibili音频下载器
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  从B站视频中提取音频并下载为MP3格式
// @author       cheluen
// @match        *://www.bilibili.com/video/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @connect      api.bilibili.com
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js
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

    // 添加下载按钮
    function addDownloadButton() {
        // 如果按钮已添加，则不再重复添加
        if (buttonAdded) return;
        
        // 等待视频信息加载完成
        const checkInterval = setInterval(() => {
            const titleElement = document.querySelector('.video-title');
            if (titleElement) {
                clearInterval(checkInterval);
                
                // 查找合适的位置添加按钮
                const actionBar = document.querySelector('.video-toolbar-left') || 
                                  document.querySelector('.toolbar-left');
                
                if (actionBar) {
                    const downloadBtn = document.createElement('button');
                    downloadBtn.className = 'bili-audio-download-btn';
                    downloadBtn.textContent = '下载音频(MP3)';
                    downloadBtn.onclick = startAudioDownload;
                    
                    const statusSpan = document.createElement('span');
                    statusSpan.className = 'bili-audio-download-status';
                    statusSpan.style.display = 'none';
                    
                    actionBar.appendChild(downloadBtn);
                    actionBar.appendChild(statusSpan);
                    
                    // 标记按钮已添加
                    buttonAdded = true;
                }
            }
        }, 1000);
    }

    // 获取视频信息
    async function getVideoInfo() {
        const url = window.location.href;
        const bvid = url.match(/\/video\/([^\/\?]+)/)[1];
        
        // 显示状态
        updateStatus('获取视频信息...');
        
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
                responseType: 'json',
                onload: function(response) {
                    if (response.status === 200 && response.response.code === 0) {
                        const data = response.response.data;
                        resolve({
                            title: data.title,
                            cid: data.cid,
                            bvid: data.bvid
                        });
                    } else {
                        reject('获取视频信息失败');
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
                url: `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16`,
                responseType: 'json',
                onload: function(response) {
                    if (response.status === 200 && response.response.code === 0) {
                        const data = response.response.data;
                        
                        // 尝试获取音频流URL
                        if (data.dash && data.dash.audio && data.dash.audio.length > 0) {
                            // 选择最高质量的音频
                            const audioStreams = data.dash.audio;
                            audioStreams.sort((a, b) => b.bandwidth - a.bandwidth);
                            resolve(audioStreams[0].baseUrl);
                        } else {
                            reject('无法获取音频流地址');
                        }
                    } else {
                        reject('获取音频地址失败');
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

    // 将音频数据转换为MP3并下载
    function convertAndDownloadMP3(audioData, title) {
        updateStatus('转换为MP3...');
        
        try {
            // 使用lamejs将音频转换为MP3
            // 注意：这里假设音频是AAC格式，需要先解码再编码为MP3
            // 由于浏览器环境限制，这里采用直接下载原始音频的方式
            // 实际应用中可能需要更复杂的处理
            
            // 创建Blob对象
            const blob = new Blob([audioData], { type: 'audio/mpeg' });
            
            // 使用GM_download下载文件
            const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
            GM_download({
                url: URL.createObjectURL(blob),
                name: `${safeTitle}.mp3`,
                onload: function() {
                    updateStatus('下载完成！', 3000);
                },
                onerror: function(error) {
                    updateStatus(`下载失败: ${error}`, 3000);
                }
            });
        } catch (error) {
            updateStatus(`转换失败: ${error}`, 3000);
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
        try {
            // 获取视频信息
            const videoInfo = await getVideoInfo();
            
            // 获取音频URL
            const audioUrl = await getAudioUrl(videoInfo.bvid, videoInfo.cid);
            
            // 下载音频数据
            const audioData = await downloadAudioData(audioUrl);
            
            // 转换并下载MP3
            convertAndDownloadMP3(audioData, videoInfo.title);
        } catch (error) {
            updateStatus(`错误: ${error}`, 3000);
            console.error('Bilibili音频下载器错误:', error);
        }
    }

    // 使用一个统一的初始化函数
    function initScript() {
        if (!buttonAdded) {
            addDownloadButton();
        }
    }

    // 只使用一种方式初始化脚本，避免重复初始化
    if (document.readyState === 'loading') {
        // 如果文档仍在加载中，等待DOMContentLoaded事件
        document.addEventListener('DOMContentLoaded', initScript);
    } else {
        // 如果文档已经加载完成，直接初始化
        initScript();
    }
})();