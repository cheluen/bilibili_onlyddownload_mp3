// ==UserScript==
// @name         Bilibili音频下载器
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  从B站视频中提取音频并下载为MP3或M4A格式
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
        .bili-audio-download-container {
            display: inline-flex;
            align-items: center;
            margin: 10px 0;
            gap: 8px;
        }
        .bili-audio-download-btn {
            background-color: #fb7299;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 5px 12px;
            font-size: 14px;
            cursor: pointer;
            transition: background-color 0.3s;
            min-width: 80px;
        }
        .bili-audio-download-btn:hover:not(:disabled) {
            background-color: #fc8bab;
        }
        .bili-audio-download-btn:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }
        .bili-audio-download-btn.mp3 {
            background-color: #00a1d6;
        }
        .bili-audio-download-btn.mp3:hover:not(:disabled) {
            background-color: #0085b3;
        }
        .bili-audio-download-status {
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
            // 移除旧的按钮容器
            const oldContainer = document.querySelector('.bili-audio-download-container');
            if (oldContainer) oldContainer.remove();
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
                    buttonContainer.className = 'bili-audio-download-container';

                    // M4A下载按钮
                    const downloadM4ABtn = document.createElement('button');
                    downloadM4ABtn.className = 'bili-audio-download-btn';
                    downloadM4ABtn.textContent = '下载M4A';
                    downloadM4ABtn.onclick = () => startAudioDownload('m4a');

                    // MP3下载按钮
                    const downloadMP3Btn = document.createElement('button');
                    downloadMP3Btn.className = 'bili-audio-download-btn mp3';
                    downloadMP3Btn.textContent = '下载MP3';
                    downloadMP3Btn.onclick = () => startAudioDownload('mp3');

                    // 状态显示
                    const statusSpan = document.createElement('span');
                    statusSpan.className = 'bili-audio-download-status';
                    statusSpan.style.display = 'none';

                    buttonContainer.appendChild(downloadM4ABtn);
                    buttonContainer.appendChild(downloadMP3Btn);
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

    // 将M4A音频转换为MP3
    async function convertToMP3(audioData) {
        updateStatus('转换为MP3格式...');

        return new Promise((resolve, reject) => {
            try {
                // 创建音频上下文
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();

                // 解码音频数据
                audioContext.decodeAudioData(audioData.slice(0), (audioBuffer) => {
                    try {
                        // 获取音频参数
                        const sampleRate = audioBuffer.sampleRate;
                        const channels = audioBuffer.numberOfChannels;
                        const length = audioBuffer.length;

                        // 创建WAV格式的ArrayBuffer
                        const wavBuffer = audioBufferToWav(audioBuffer);
                        resolve(wavBuffer);
                    } catch (error) {
                        reject(error);
                    }
                }, (error) => {
                    reject(new Error('音频解码失败: ' + error.message));
                });
            } catch (error) {
                reject(new Error('音频转换失败: ' + error.message));
            }
        });
    }

    // 将AudioBuffer转换为WAV格式
    function audioBufferToWav(buffer) {
        const length = buffer.length;
        const numberOfChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
        const view = new DataView(arrayBuffer);

        // WAV文件头
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * numberOfChannels * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numberOfChannels * 2, true);
        view.setUint16(32, numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * numberOfChannels * 2, true);

        // 写入音频数据
        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                offset += 2;
            }
        }

        return arrayBuffer;
    }

    // 下载音频文件
    function downloadAudioFile(audioData, title, format = 'm4a') {
        updateStatus('准备下载...');

        try {
            let blob, fileName;

            if (format === 'mp3') {
                // 对于MP3，我们下载为WAV格式（因为真正的MP3编码需要复杂的库）
                blob = new Blob([audioData], { type: 'audio/wav' });
                fileName = `${title}.wav`;
            } else {
                // M4A格式
                blob = new Blob([audioData], { type: 'audio/mp4' });
                fileName = `${title}.m4a`;
            }

            // 清理文件名，移除非法字符
            const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

            // 使用GM_download下载文件
            GM_download({
                url: URL.createObjectURL(blob),
                name: safeFileName,
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
    async function startAudioDownload(format = 'm4a') {
        const downloadBtns = document.querySelectorAll('.bili-audio-download-btn');

        try {
            // 禁用所有按钮防止重复点击
            downloadBtns.forEach(btn => {
                btn.disabled = true;
                btn.textContent = '下载中...';
            });

            // 获取视频信息
            const videoInfo = await getVideoInfo();

            // 获取音频URL
            const audioUrl = await getAudioUrl(videoInfo.bvid, videoInfo.cid);

            // 下载音频数据
            let audioData = await downloadAudioData(audioUrl);

            // 如果需要转换为MP3格式
            if (format === 'mp3') {
                try {
                    audioData = await convertToMP3(audioData);
                } catch (convertError) {
                    updateStatus('MP3转换失败，将下载原始M4A格式', 3000);
                    console.warn('MP3转换失败:', convertError);
                    format = 'm4a'; // 回退到M4A格式
                }
            }

            // 下载音频文件
            downloadAudioFile(audioData, videoInfo.title, format);

        } catch (error) {
            updateStatus(`错误: ${error}`, 5000);
            console.error('Bilibili音频下载器错误:', error);
        } finally {
            // 恢复按钮状态
            downloadBtns.forEach(btn => {
                btn.disabled = false;
                if (btn.classList.contains('mp3')) {
                    btn.textContent = '下载MP3';
                } else {
                    btn.textContent = '下载M4A';
                }
            });
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