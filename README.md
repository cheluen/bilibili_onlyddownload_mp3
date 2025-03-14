# Bilibili音频下载器

这是一个油猴(Tampermonkey)脚本，用于从B站视频中提取音频并下载为MP3格式。无需额外软件，直接在浏览器中操作即可获取高质量MP3音频文件。

## 功能特点

- 在B站视频页面添加音频下载按钮
- 自动提取视频中的最高质量音频
- 将音频保存为MP3格式
- 显示下载进度和状态
- 支持所有B站视频页面（包括普通视频、番剧、电影等）

## 安装方法

1. 首先确保您的浏览器已安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 点击 [这里](hhttps://github.com/cheluen/bilibili_onlyddownload_mp3/raw/refs/heads/main/bilibili_audio_downloader.user.js) 安装脚本（或者将`bilibili_audio_downloader.user.js`文件拖拽到Tampermonkey扩展页面）
3. 在弹出的安装页面中点击「安装」按钮

## 使用方法

1. 打开任意B站视频页面
2. 在视频播放器下方的工具栏中找到「下载音频(MP3)」按钮
3. 点击按钮开始下载过程
4. 等待下载完成后，音频文件将自动保存到您的下载文件夹中

## 注意事项

- 本脚本仅供学习和个人使用
- 请尊重创作者的版权，不要将下载的音频用于商业用途
- 由于B站网页结构可能会变化，如果脚本无法正常工作，请检查是否有更新版本
- 下载速度取决于您的网络环境和B站服务器状态

## 技术说明

脚本使用了以下技术：
- GM_xmlhttpRequest 用于跨域请求B站API
- GM_download 用于下载音频文件
- 使用B站官方API获取视频信息和音频流地址
- 自动处理音频格式转换

## 常见问题

**Q: 为什么有些视频无法下载？**
A: 部分版权受限的视频可能无法正常提取音频，这是由于B站的版权保护机制导致的。

**Q: 下载的音频质量如何？**
A: 脚本会自动选择可用的最高音质进行下载，通常为320kbps或192kbps的MP3格式。

## 更新日志

### v0.2 (2023-12-15)
- 优化下载进度显示
- 修复部分视频无法下载的问题
- 提高音频转换质量

### v0.1 (初始版本)
- 实现基本的音频提取和下载功能
- 添加下载状态显示
- 支持高质量音频选择

## 许可证

本项目采用 MIT 许可证，详情请参阅 LICENSE 文件。