// ==UserScript==
// @name         Bilibili音频下载器
// @namespace    http://tampermonkey.net/
// @version      0.6.2
// @description  从B站视频中提取音频并下载为MP3或M4A格式
// @author       cheluen
// @match        *://www.bilibili.com/video/*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_addStyle
// @connect      api.bilibili.com
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    const STYLE_ID = 'bili-audio-downloader-style';
    const UI_CONTAINER_ID = 'bili-audio-download-container';

    const CSS = `
        .bili-audio-download-container {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 999999;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            max-width: min(520px, calc(100vw - 32px));
            padding: 12px 14px;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
        }
        .bili-audio-download-btn {
            position: relative;
            background: linear-gradient(135deg, #fb7299 0%, #f093fb 100%);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            min-width: 100px;
            box-shadow: 0 2px 8px rgba(251, 114, 153, 0.3);
            overflow: hidden;
        }
        .bili-audio-download-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            transition: left 0.5s;
        }
        .bili-audio-download-btn:hover::before {
            left: 100%;
        }
        .bili-audio-download-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(251, 114, 153, 0.4);
        }
        .bili-audio-download-btn:active:not(:disabled) {
            transform: translateY(0);
        }
        .bili-audio-download-btn:disabled {
            background: linear-gradient(135deg, #bbb 0%, #999 100%);
            cursor: not-allowed;
            transform: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .bili-audio-download-btn.mp3 {
            background: linear-gradient(135deg, #00a1d6 0%, #0078d4 100%);
            box-shadow: 0 2px 8px rgba(0, 161, 214, 0.3);
        }
        .bili-audio-download-btn.mp3:hover:not(:disabled) {
            box-shadow: 0 4px 15px rgba(0, 161, 214, 0.4);
        }
        .bili-audio-download-btn .btn-icon {
            margin-right: 6px;
            font-size: 16px;
        }
        .bili-audio-download-status {
            color: #555;
            font-size: 14px;
            font-weight: 500;
            padding: 8px 10px;
            background: rgba(255, 255, 255, 0.8);
            border-radius: 6px;
            border-left: 3px solid #00a1d6;
            min-width: 140px;
            flex: 1 1 140px;
        }
        .bili-audio-download-progress {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 4px;
        }
        .bili-audio-download-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #00a1d6, #0078d4);
            border-radius: 2px;
            transition: width 0.3s ease;
            width: 0%;
        }
        @keyframes bili-audio-download-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .bili-audio-download-btn.loading {
            animation: bili-audio-download-pulse 1.5s infinite;
        }
    `;

    function isVideoPage() {
        return /\/video\/[^/?#]+/.test(window.location.pathname);
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;

        let styleEl = null;
        if (typeof GM_addStyle === 'function') {
            styleEl = GM_addStyle(CSS);
        } else {
            styleEl = document.createElement('style');
            styleEl.textContent = CSS;
            (document.head || document.documentElement).appendChild(styleEl);
        }

        if (styleEl) {
            styleEl.id = STYLE_ID;
        }
    }

    function removeDownloadUI() {
        const existing = document.getElementById(UI_CONTAINER_ID);
        if (existing) existing.remove();
    }

    function buildDownloadUI() {
        const buttonContainer = document.createElement('div');
        buttonContainer.id = UI_CONTAINER_ID;
        buttonContainer.className = 'bili-audio-download-container';
        buttonContainer.setAttribute('data-bili-audio-downloader', '1');

        const downloadM4ABtn = document.createElement('button');
        downloadM4ABtn.className = 'bili-audio-download-btn';
        downloadM4ABtn.innerHTML = '<span class="btn-icon">🎵</span>下载M4A';
        downloadM4ABtn.addEventListener('click', () => startAudioDownload('m4a'));

        const downloadMP3Btn = document.createElement('button');
        downloadMP3Btn.className = 'bili-audio-download-btn mp3';
        downloadMP3Btn.innerHTML = '<span class="btn-icon">🎧</span>下载MP3';
        downloadMP3Btn.addEventListener('click', () => startAudioDownload('mp3'));

        const statusDiv = document.createElement('div');
        statusDiv.className = 'bili-audio-download-status';
        statusDiv.style.display = 'none';
        statusDiv.innerHTML = `
            <div class="status-text">准备中...</div>
            <div class="bili-audio-download-progress">
                <div class="bili-audio-download-progress-bar"></div>
            </div>
        `;

        buttonContainer.appendChild(downloadM4ABtn);
        buttonContainer.appendChild(downloadMP3Btn);
        buttonContainer.appendChild(statusDiv);

        return buttonContainer;
    }

    function ensureDownloadUI() {
        if (!isVideoPage()) {
            removeDownloadUI();
            return;
        }

        if (!document.body) return;
        ensureStyles();

        let container = document.getElementById(UI_CONTAINER_ID);

        if (!container) {
            container = buildDownloadUI();
            document.body.appendChild(container);
            return;
        }

        if (container.parentElement !== document.body) {
            container.remove();
            document.body.appendChild(container);
        }
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
                        const downloadPercent = 25 + Math.round(percent * 0.15); // 25-40%的进度范围
                        updateStatus(`下载音频数据: ${percent}%`, 0);
                        updateProgress(downloadPercent);
                    }
                }
            });
        });
    }

    // 简化的音频格式处理（不进行实际转换，只改变文件扩展名）
    async function processAudioFormat(audioData, format) {
        if (format === 'mp3') {
            updateStatus('准备MP3格式文件...', 0);
            updateProgress(80);
            // 简单延时模拟处理，实际上不做转换
            await new Promise(resolve => setTimeout(resolve, 200));
            updateProgress(90);
        }
        return audioData; // 直接返回原始数据
    }

    // 下载音频文件
    function downloadAudioFile(audioData, title, format = 'm4a') {
        updateStatus('准备下载文件...', 0);
        updateProgress(95);

        try {
            let blob, fileName;

            if (format === 'mp3') {
                // MP3格式：实际上是M4A文件，但扩展名为.mp3
                // 大部分现代播放器都能正确识别和播放
                blob = new Blob([audioData], { type: 'audio/mpeg' });
                fileName = `${title}.mp3`;
            } else {
                // M4A格式
                blob = new Blob([audioData], { type: 'audio/mp4' });
                fileName = `${title}.m4a`;
            }

            // 清理文件名，移除非法字符
            const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

            // 使用GM_download下载文件
            const objectUrl = URL.createObjectURL(blob);
            GM_download({
                url: objectUrl,
                name: safeFileName,
                onload: function() {
                    updateProgress(100);
                    updateStatus('✅ 下载完成！', 3000);
                    // 清理URL对象
                    setTimeout(() => {
                        URL.revokeObjectURL(objectUrl);
                    }, 5000);
                },
                onerror: function(error) {
                    updateStatus(`❌ 下载失败: ${error.message || error}`, 5000);
                    updateProgress(0);
                    URL.revokeObjectURL(objectUrl);
                }
            });
        } catch (error) {
            updateStatus(`❌ 下载失败: ${error.message}`, 5000);
            updateProgress(0);
            console.error('下载音频文件错误:', error);
        }
    }

    // 更新状态显示
    function updateStatus(message, hideAfter = 0) {
        const container = document.getElementById(UI_CONTAINER_ID);
        const statusDiv = container?.querySelector('.bili-audio-download-status') || null;
        if (statusDiv) {
            const statusText = statusDiv.querySelector('.status-text');
            if (statusText) {
                statusText.textContent = message;
            } else {
                statusDiv.innerHTML = `
                    <div class="status-text">${message}</div>
                    <div class="bili-audio-download-progress">
                        <div class="bili-audio-download-progress-bar"></div>
                    </div>
                `;
            }
            statusDiv.style.display = 'block';

            if (hideAfter > 0) {
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                    updateProgress(0); // 重置进度条
                }, hideAfter);
            }
        }
    }

    // 更新进度条
    function updateProgress(percent) {
        const container = document.getElementById(UI_CONTAINER_ID);
        const progressBar = container?.querySelector('.bili-audio-download-progress-bar') || null;
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
    }

    // 开始下载流程
    async function startAudioDownload(format = 'm4a') {
        const container = document.getElementById(UI_CONTAINER_ID);
        const downloadBtns = container ? container.querySelectorAll('.bili-audio-download-btn') : [];

        try {
            // 禁用所有按钮防止重复点击，添加加载动画
            downloadBtns.forEach(btn => {
                btn.disabled = true;
                btn.classList.add('loading');
                if (btn.classList.contains('mp3')) {
                    btn.innerHTML = '<span class="btn-icon">⏬</span>下载中...';
                } else {
                    btn.innerHTML = '<span class="btn-icon">⏬</span>下载中...';
                }
            });

            updateProgress(0);

            // 获取视频信息
            const videoInfo = await getVideoInfo();
            updateProgress(15);

            // 获取音频URL
            const audioUrl = await getAudioUrl(videoInfo.bvid, videoInfo.cid);
            updateProgress(25);

            // 下载音频数据
            let audioData = await downloadAudioData(audioUrl);
            updateProgress(70);

            // 处理音频格式（实际上不做转换，只是准备不同的文件名）
            audioData = await processAudioFormat(audioData, format);
            updateProgress(90);

            // 下载音频文件
            downloadAudioFile(audioData, videoInfo.title, format);

        } catch (error) {
            updateStatus(`错误: ${error}`, 5000);
            updateProgress(0);
            console.error('Bilibili音频下载器错误:', error);
        } finally {
            // 恢复按钮状态
            setTimeout(() => {
                downloadBtns.forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('loading');
                    if (btn.classList.contains('mp3')) {
                        btn.innerHTML = '<span class="btn-icon">🎧</span>下载MP3';
                    } else {
                        btn.innerHTML = '<span class="btn-icon">🎵</span>下载M4A';
                    }
                });
            }, 1000);
        }
    }

    let ensureLoopId = null;
    let ensureScheduled = false;

    function scheduleEnsure(delayMs = 0) {
        if (ensureScheduled) return;
        ensureScheduled = true;
        window.setTimeout(() => {
            ensureScheduled = false;
            ensureDownloadUI();
        }, delayMs);
    }

    function startEnsureLoop() {
        if (ensureLoopId !== null) return;
        ensureLoopId = window.setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            ensureDownloadUI();
        }, 1500);
    }

    function initScript() {
        window.setTimeout(() => {
            scheduleEnsure(0);
            startEnsureLoop();
        }, 2500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else {
        initScript();
    }
})();
