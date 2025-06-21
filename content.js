// 确保content.js正确转发消息

// 监听来自扩展的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script收到消息:', message);
    
    // 转发消息到注入脚本
    window.postMessage({
        type: 'FROM_EXTENSION',
        action: message.action,
        examId: message.examId,
        examDetailType: message.examDetailType,
        paperId: message.paperId,
        academicYear: message.academicYear,
        pageIndex: message.pageIndex
    }, '*');
    
    // 监听注入脚本的响应
    const responseListener = (event) => {
        if (event.source === window && event.data.type === 'TO_EXTENSION') {
            console.log('Content script收到注入脚本响应:', event.data);
            window.removeEventListener('message', responseListener);
            sendResponse(event.data.data);
        }
    };
    
    window.addEventListener('message', responseListener);
    
    // 设置超时处理
    setTimeout(() => {
        window.removeEventListener('message', responseListener);
        if (!sendResponse.called) {
            console.log('Content script超时，发送失败响应');
            sendResponse({ success: false, error: '请求超时' });
        }
    }, 30000); // 30秒超时
    
    // 返回true表示将异步发送响应
    return true;
});

// 注入脚本到页面
function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
        console.log('Inject script已加载');
        this.remove();
    };
    script.onerror = function() {
        console.error('Inject script加载失败');
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

// 页面加载完成时注入脚本
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectScript);
} else {
    injectScript();
}

// 监听页面消息，确认注入脚本已加载
window.addEventListener('message', (event) => {
    if (event.source === window && event.data.type === 'SCRIPT_LOADED') {
        console.log('✅ 注入脚本已成功加载并运行');
    }
});