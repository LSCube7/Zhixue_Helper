// 监听扩展图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
    try {
        // 直接打开扩展页面
        await chrome.tabs.create({
            url: chrome.runtime.getURL('extension.html')
        });
    } catch (error) {
        console.error('打开扩展页面失败:', error);
    }
});

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ZHIXUE_DATA') {
        console.log('收到智学网数据:', request.data);
    }
    return true;
});