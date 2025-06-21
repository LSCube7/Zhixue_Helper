let zhixueTabs = [];
let currentData = null;
let currentPage = 1;
let academicYearData = null;
let selectedAcademicYear = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeExtension();
    bindEventListeners();
    bindGlobalExamClickEvents();
    checkZhixueTabs();
    startTabChecking(); // 启动定时检查
});

// 初始化扩展
function initializeExtension() {
    updateConnectionStatus('正在检查智学网页面...');
}

// 绑定事件监听器
function bindEventListeners() {
    document.getElementById('getExamListBtn').addEventListener('click', getExamList);
    document.getElementById('zhixueTab').addEventListener('change', onTabChange);
    document.getElementById('openZhixueBtn').addEventListener('click', openZhixue);
    document.getElementById('refreshBtn').addEventListener('click', checkZhixueTabs);
}

// 检查智学网标签页
async function checkZhixueTabs() {
    try {
        const tabs = await chrome.tabs.query({});
        const newZhixueTabs = tabs.filter(tab => tab.url && tab.url.includes('zhixue.com'));
        
        const statusPanel = document.getElementById('statusPanel');
        const noConnectionPanel = document.getElementById('noConnectionPanel');
        const controlPanel = document.getElementById('controlPanel');
        const zhixueTabsContainer = document.getElementById('zhixueTabsContainer');
        const tabSelect = document.getElementById('zhixueTab');
        
        if (newZhixueTabs.length === 0) {
            // 没有智学网页面
            updateConnectionStatus('❌ 未找到智学网页面');
            statusPanel.style.display = 'block';
            noConnectionPanel.style.display = 'block';
            controlPanel.style.display = 'none';
            zhixueTabsContainer.style.display = 'none';
            
            // 只有在页面确实需要重置时才调用 showNoConnection
            if (zhixueTabs.length > 0) {
                showNoConnection();
            }
        } else {
            // 找到智学网页面
            updateConnectionStatus(`✅ 找到 ${newZhixueTabs.length} 个智学网页面`);
            statusPanel.style.display = 'block';
            noConnectionPanel.style.display = 'none';
            controlPanel.style.display = 'block';
            zhixueTabsContainer.style.display = 'block';
            
            // 更新标签页列表
            tabSelect.innerHTML = '<option value="">请选择智学网页面</option>';
            newZhixueTabs.forEach((tab, index) => {
                const title = tab.title.length > 30 ? tab.title.substring(0, 30) + '...' : tab.title;
                tabSelect.innerHTML += `<option value="${index}">${title}</option>`;
            });
            
            // 如果之前有选择的标签页，尝试保持选择状态
            const currentSelectedIndex = tabSelect.selectedIndex;
            if (zhixueTabs.length > 0 && currentSelectedIndex > 0) {
                // 尝试保持之前的选择
                if (currentSelectedIndex <= newZhixueTabs.length) {
                    tabSelect.selectedIndex = currentSelectedIndex;
                } else if (newZhixueTabs.length > 0) {
                    tabSelect.selectedIndex = 1;
                }
            } else if (newZhixueTabs.length > 0) {
                // 默认选择第一个（仅在首次检测时）
                if (zhixueTabs.length === 0) {
                    tabSelect.selectedIndex = 1;
                    showReady();
                }
            }
        }
        
        // 更新标签页列表
        zhixueTabs = newZhixueTabs;
        
    } catch (error) {
        updateConnectionStatus('❌ 检查页面失败: ' + error.message);
        // 不要自动显示无连接面板，除非真的需要
        if (zhixueTabs.length === 0) {
            document.getElementById('noConnectionPanel').style.display = 'block';
            document.getElementById('controlPanel').style.display = 'none';
        }
    }
}

// 显示无连接状态
function showNoConnection() {
    const dataDisplay = document.getElementById('dataDisplay');
    dataDisplay.innerHTML = `
        <h3>等待连接</h3>
        <div style="text-align: center; padding: 50px; color: #666; font-size: 16px;">
            请先打开智学网页面并登录，然后点击"重新检测"按钮
        </div>
    `;
}

// 显示准备就绪状态
function showReady() {
    const dataDisplay = document.getElementById('dataDisplay');
    dataDisplay.innerHTML = `
        <h3>准备就绪</h3>
        <div style="text-align: center; padding: 50px; color: #666; font-size: 16px;">
            点击"获取考试列表"按钮开始获取数据
        </div>
    `;
}

// 打开智学网
async function openZhixue() {
    try {
        await chrome.tabs.create({ url: 'https://www.zhixue.com' });
        updateConnectionStatus('已打开智学网，请登录后点击"重新检测"');
    } catch (error) {
        console.error('打开智学网失败:', error);
        updateConnectionStatus('❌ 打开智学网失败: ' + error.message);
    }
}

// 标签页切换事件
function onTabChange() {
    const tabSelect = document.getElementById('zhixueTab');
    if (tabSelect.value) {
        showReady();
    }
}

// 更新连接状态
function updateConnectionStatus(message) {
    document.getElementById('connectionStatus').textContent = message;
}

// 显示加载状态
function showLoading(message = '正在加载...') {
    const dataDisplay = document.getElementById('dataDisplay');
    dataDisplay.innerHTML = `
        <h3>数据加载中</h3>
        <div class="loading">${message}</div>
    `;
}

// 显示错误信息
function showError(message) {
    const dataDisplay = document.getElementById('dataDisplay');
    dataDisplay.innerHTML = `
        <h3>操作失败</h3>
        <div class="error">${message}</div>
    `;
}

// 显示成功信息
function showSuccess(message) {
    const dataDisplay = document.getElementById('dataDisplay');
    dataDisplay.innerHTML = `
        <h3>操作成功</h3>
        <div class="success">${message}</div>
    `;
}

// 获取当前选中的标签页
function getCurrentZhixueTab() {
    const tabSelect = document.getElementById('zhixueTab');
    const selectedIndex = parseInt(tabSelect.value);
    
    if (isNaN(selectedIndex) || !zhixueTabs[selectedIndex]) {
        throw new Error('请先选择一个智学网页面');
    }
    
    return zhixueTabs[selectedIndex];
}

// 向content script发送消息
async function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
        console.log('发送消息到标签页:', tabId, message);
        
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                console.error('消息发送失败:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                console.log('收到响应:', response);
                resolve(response);
            }
        });
    });
}

// 获取考试列表
async function getExamList() {
    const btn = document.getElementById('getExamListBtn');
    
    try {
        btn.textContent = '获取中...';
        btn.disabled = true;
        
        showLoading('正在获取学年信息...');
        
        const currentTab = getCurrentZhixueTab();
        console.log('当前选中的标签页:', currentTab);
        
        // 先获取学年数据
        try {
            const yearResponse = await sendMessageToTab(currentTab.id, {
                action: 'getAcademicYear'
            });
            if (yearResponse && yearResponse.success) {
                academicYearData = yearResponse.data;
                // 显示学年选择器
                displayYearSelector();
            } else {
                showError('获取学年信息失败');
                return;
            }
        } catch (error) {
            console.error('获取学年数据失败:', error);
            showError('获取学年信息失败: ' + error.message);
            return;
        }
        
    } catch (error) {
        console.error('获取学年信息失败:', error);
        showError('获取学年信息失败: ' + error.message);
    } finally {
        btn.textContent = '获取考试列表';
        btn.disabled = false;
    }
}

// 显示学年选择器
function displayYearSelector() {
    const dataDisplay = document.getElementById('dataDisplay');
    
    if (!academicYearData || !academicYearData.result) {
        showError('学年数据格式错误');
        return;
    }
    
    let html = `
        <h3>选择学年</h3>
        <div class="year-selector">
            <label for="yearSelect">请选择要查看的学年:</label>
            <select id="yearSelect">
                <option value="">-- 请选择学年 --</option>
    `;
    
    academicYearData.result.forEach((year, index) => {
        html += `<option value="${index}">${year.name}</option>`;
    });
    
    html += `
            </select>
        </div>
        <div class="year-selection-hint">
            选择学年后将显示该学年的考试列表
        </div>
    `;
    
    dataDisplay.innerHTML = html;
    
    // 绑定学年选择器事件
    bindYearSelectorEvents();
}

// 获取指定学年的考试列表
async function getExamListForYear(academicYear) {
    showLoading('正在获取考试列表...');
    
    try {
        const currentTab = getCurrentZhixueTab();
        const response = await sendMessageToTab(currentTab.id, {
            action: 'getExamList',
            pageIndex: 1,
            academicYear: academicYear
        });
        
        if (response && response.success) {
            currentData = response.data;
            currentPage = 1;
            selectedAcademicYear = academicYear;
            displayExamListData(currentData);
        } else {
            showError(response ? response.error : '获取考试列表失败');
        }
        
    } catch (error) {
        console.error('获取考试列表失败:', error);
        showError('获取考试列表失败: ' + error.message);
    }
}

// 显示考试列表数据
function displayExamListData(data) {
    const dataDisplay = document.getElementById('dataDisplay');
    
    if (!data || !data.result) {
        showError('考试列表数据格式错误');
        return;
    }
    
    let html = `<h3>考试列表</h3>`;
    
    // 学年选择器（已选择状态）
    if (academicYearData && academicYearData.result) {
        html += createSelectedYearSelector();
    }
    
    // 考试列表
    if (data.result.examList && data.result.examList.length > 0) {
        html += '<div style="margin-top: 20px;">';
        
        data.result.examList.forEach(exam => {
            const examDate = new Date(exam.examCreateDateTime).toLocaleDateString('zh-CN');
            const examType = getExamTypeName(exam.examType);
            const isFinal = exam.isFinal;
            
            html += `
                <div class="exam-item clickable ${isFinal ? 'exam-final' : 'exam-ongoing'}" 
                     data-exam-id="${exam.examId}" 
                     data-exam-name="${exam.examName}">
                    <div class="exam-name">${exam.examName}</div>
                    <div class="exam-time">${examDate}</div>
                    <div class="exam-type">${examType}</div>
                    <div class="exam-status ${isFinal ? 'status-final' : 'status-ongoing'}">
                        ${isFinal ? '批阅完成' : '正在批阅'}
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // 分页控件
        html += createPagination(data.result.hasNextPage);
        
    } else {
        const yearName = selectedAcademicYear ? selectedAcademicYear.name : '当前学年';
        html += `
            <div class="no-exam-message">
                <div class="icon">📝</div>
                <div class="title">${yearName}无考试</div>
                <div class="subtitle">该学年暂时没有考试记录</div>
            </div>
        `;
    }
    
    dataDisplay.innerHTML = html;
    
    // 绑定事件
    bindPaginationEvents();
    bindYearSelectorEvents();
    bindExamItemEvents(); // 绑定考试项目点击事件
}

// 创建已选择状态的学年选择器
function createSelectedYearSelector() {
    let html = `
        <div class="year-selector">
            <label for="yearSelect">选择学年:</label>
            <select id="yearSelect">
    `;
    
    academicYearData.result.forEach((year, index) => {
        const selected = (selectedAcademicYear && selectedAcademicYear.code === year.code) ? 'selected' : '';
        html += `<option value="${index}" ${selected}>${year.name}</option>`;
    });
    
    html += `
            </select>
        </div>
    `;
    
    return html;
}

// 创建分页控件
function createPagination(hasNextPage) {
    return `
        <div class="pagination">
            <button class="page-btn prev" id="prevPage" ${currentPage <= 1 ? 'disabled' : ''}>
                上一页
            </button>
            <span class="page-info">第 ${currentPage} 页</span>
            <button class="page-btn next" id="nextPage" ${!hasNextPage ? 'disabled' : ''}>
                下一页
            </button>
        </div>
    `;
}

// 绑定学年选择器事件
function bindYearSelectorEvents() {
    const yearSelect = document.getElementById('yearSelect');
    
    if (yearSelect) {
        yearSelect.addEventListener('change', async (e) => {
            const selectedIndex = e.target.value;
            
            if (selectedIndex === '') {
                // 如果选择了空选项，显示选择提示
                displayYearSelector();
                return;
            }
            
            const selectedYear = academicYearData.result[parseInt(selectedIndex)];
            
            if (selectedYear) {
                await getExamListForYear(selectedYear);
            }
        });
    }
}

// 绑定分页事件
function bindPaginationEvents() {
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => changePage(currentPage - 1));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => changePage(currentPage + 1));
    }
}

// 翻页
async function changePage(newPage) {
    if (newPage < 1) return;
    
    showLoading(`正在加载第 ${newPage} 页...`);
    
    try {
        const currentTab = getCurrentZhixueTab();
        const response = await sendMessageToTab(currentTab.id, {
            action: 'getExamList',
            pageIndex: newPage,
            academicYear: selectedAcademicYear
        });
        
        if (response && response.success) {
            currentData = response.data;
            currentPage = newPage;
            displayExamListData(currentData);
        } else {
            showError('翻页失败');
        }
    } catch (error) {
        showError('翻页失败: ' + error.message);
    }
}

// 获取考试类型中文名称
function getExamTypeName(examType) {
    const typeMap = {
        'terminalExam': '期末考试',
        'midtermExam': '期中考试',
        'monthlyExam': '月考',
        'weeklyExam': '周练',
        'dailyExam': '日练'
    };
    return typeMap[examType] || examType;
}

// 修复 showExamDetail 函数，添加科目获取进度
async function showExamDetail(examId, examName) {
    console.log('=== 开始显示考试详情 ===');
    console.log('考试ID:', examId);
    console.log('考试名称:', examName);
    console.log('当前选择的学年:', selectedAcademicYear);
    
    showLoading('正在获取考试详情...');
    
    try {
        const currentTab = getCurrentZhixueTab();
        
        // 1. 获取基本报告数据
        showLoadingWithProgress('正在获取考试基本信息...', 0, 3);
        
        const reportMainResponse = await sendMessageToTab(currentTab.id, {
            action: 'getExamDetail',
            examId: examId,
            examDetailType: 'getReportMain',
            academicYear: selectedAcademicYear
        });
        
        if (!reportMainResponse || !reportMainResponse.success) {
            showError('获取考试报告失败: ' + (reportMainResponse?.error || '未知错误'));
            return;
        }
        
        // 2. 获取总分排名数据
        showLoadingWithProgress('正在获取总分排名信息...', 1, 3);
        
        const levelTrendResponse = await sendMessageToTab(currentTab.id, {
            action: 'getExamDetail',
            examId: examId,
            examDetailType: 'getLevelTrend',
            academicYear: selectedAcademicYear
        }).catch(error => {
            console.error('获取levelTrend失败:', error);
            return { success: false, error: error.message };
        });
        
        // 3. 获取各科目的排名数据 - 关键修复点，添加进度显示
        let subjectLevelTrend = {};
        if (reportMainResponse.data && reportMainResponse.data.result && reportMainResponse.data.result.paperList) {
            console.log('开始获取各科目排名数据...');
            
            const paperList = reportMainResponse.data.result.paperList;
            console.log('科目列表:', paperList.map(p => ({ subjectName: p.subjectName, paperId: p.paperId })));
            
            const totalSubjects = paperList.length;
            console.log(`总共需要获取 ${totalSubjects} 个科目的排名数据`);
            
            // 显示科目获取开始
            showLoadingWithProgress('正在获取各科目排名数据...', 2, 3);
            
            // 修复：为每个科目单独获取数据，并显示进度
            for (let i = 0; i < paperList.length; i++) {
                const paper = paperList[i];
                const currentSubjectIndex = i + 1;
                
                try {
                    // 显示当前科目获取进度
                    showSubjectLoadingProgress(
                        paper.subjectName, 
                        currentSubjectIndex, 
                        totalSubjects
                    );
                    
                    console.log(`获取科目 ${paper.subjectName} (${paper.paperId}) 的排名数据... (${currentSubjectIndex}/${totalSubjects})`);
                    
                    const subjectResponse = await sendMessageToTab(currentTab.id, {
                        action: 'getSubjectLevelTrend',
                        examId: examId,
                        paperId: paper.paperId,
                        academicYear: selectedAcademicYear
                    });
                    
                    if (subjectResponse && subjectResponse.success) {
                        console.log(`科目 ${paper.subjectName} 排名数据获取成功:`, subjectResponse.data);
                        
                        // 确保每个科目的数据都独立存储
                        subjectLevelTrend[paper.paperId] = {
                            ...subjectResponse.data,
                            subjectName: paper.subjectName, // 添加科目名称用于调试
                            paperId: paper.paperId // 确保paperId存在
                        };
                        
                        console.log(`存储科目 ${paper.subjectName} (${paper.paperId}) 的排名数据完成`);
                    } else {
                        console.warn(`获取科目 ${paper.subjectName} 排名失败:`, subjectResponse?.error);
                        // 即使失败也要标记，避免后续混淆
                        subjectLevelTrend[paper.paperId] = null;
                    }
                } catch (error) {
                    console.error(`获取科目 ${paper.subjectName} 排名出错:`, error);
                    subjectLevelTrend[paper.paperId] = null;
                }
            }
            
            console.log('所有科目排名数据获取完成，最终数据结构:');
            Object.keys(subjectLevelTrend).forEach(paperId => {
                const data = subjectLevelTrend[paperId];
                if (data) {
                    console.log(`  ${paperId} (${data.subjectName}): 有数据`);
                } else {
                    console.log(`  ${paperId}: 无数据`);
                }
            });
        }
        
        // 4. 获取其他数据（可选）
        showLoadingWithProgress('正在获取诊断信息...', 3, 3);
        
        const subjectDiagnosisResponse = await sendMessageToTab(currentTab.id, {
            action: 'getExamDetail',
            examId: examId,
            examDetailType: 'getSubjectDiagnosis',
            academicYear: selectedAcademicYear
        }).catch(error => {
            console.error('获取subjectDiagnosis失败:', error);
            return { success: false, error: error.message };
        });
        
        // 5. 显示完成消息
        showLoadingWithProgress('正在生成详情页面...', 3, 3);
        
        console.log('=== 所有数据获取完成，开始显示详情页面 ===');
        
        displayExamDetail({
            examId,
            examName,
            reportMain: reportMainResponse.data,
            levelTrend: levelTrendResponse?.success ? levelTrendResponse.data : null,
            subjectLevelTrend: subjectLevelTrend,
            subjectDiagnosis: subjectDiagnosisResponse?.success ? subjectDiagnosisResponse.data : null
        });
        
    } catch (error) {
        console.error('获取考试详情失败:', error);
        showError('获取考试详情失败: ' + error.message);
    }
}

// 添加带进度的加载显示函数
function showLoadingWithProgress(message, current, total) {
    const dataDisplay = document.getElementById('dataDisplay');
    const percentage = Math.round((current / total) * 100);
    
    dataDisplay.innerHTML = `
        <div class="loading-container">
            <h3>正在加载考试详情</h3>
            <div class="loading-progress">
                <div class="progress-info">
                    <span class="progress-message">${message}</span>
                    <span class="progress-text">${current}/${total}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="progress-percentage">${percentage}%</div>
                </div>
            </div>
            <div class="loading-spinner">
                <div class="spinner"></div>
            </div>
        </div>
    `;
}

// 添加科目获取进度显示函数
function showSubjectLoadingProgress(subjectName, current, total) {
    const dataDisplay = document.getElementById('dataDisplay');
    const percentage = Math.round((current / total) * 100);
    
    dataDisplay.innerHTML = `
        <div class="loading-container">
            <h3>正在获取各科目排名数据</h3>
            <div class="loading-progress">
                <div class="progress-info">
                    <span class="progress-message">正在获取 "${subjectName}" 的排名数据...</span>
                    <span class="progress-text">${current}/${total}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="progress-percentage">${percentage}%</div>
                </div>
            </div>
            <div class="subject-progress-list">
                <div class="progress-hint">
                    📊 正在逐个获取各科目的排名和等第信息，请稍候...
                </div>
            </div>
            <div class="loading-spinner">
                <div class="spinner"></div>
            </div>
        </div>
    `;
}
// 修复获取单科排名信息的函数
function getSubjectClassRankInfo(paperId, subjectLevelTrend) {
    console.log(`查找paperId ${paperId} 的单科排名数据`);
    console.log('可用的subjectLevelTrend keys:', Object.keys(subjectLevelTrend || {}));
    
    if (!subjectLevelTrend || !subjectLevelTrend[paperId]) {
        console.log(`未找到paperId ${paperId} 对应的单科排名数据`);
        return null;
    }
    
    const subjectData = subjectLevelTrend[paperId];
    console.log(`paperId ${paperId} 的完整数据结构:`, subjectData);
    
    if (!subjectData.result) {
        console.log(`paperId ${paperId} 缺少result字段`);
        return null;
    }
    
    // 检查是否有list数据
    if (!subjectData.result.list || subjectData.result.list.length === 0) {
        console.log(`paperId ${paperId} 的list数据为空`);
        return null;
    }
    
    // 关键修复：为每个科目找到对应的数据
    // 方法1: 通过paperId匹配
    let currentSubjectData = null;
    
    for (const item of subjectData.result.list) {
        // 检查是否有paperId字段匹配
        if (item.paperId === paperId) {
            currentSubjectData = item;
            console.log(`通过paperId匹配找到科目数据:`, item);
            break;
        }
        
        // 如果没有paperId字段，但只有一个科目数据，使用它
        if (subjectData.result.list.length === 1) {
            currentSubjectData = item;
            console.log(`只有一个科目数据，使用它:`, item);
            break;
        }
    }
    
    // 如果还没找到，尝试使用第一个数据
    if (!currentSubjectData && subjectData.result.list.length > 0) {
        currentSubjectData = subjectData.result.list[0];
        console.log(`使用第一个数据作为科目数据:`, currentSubjectData);
    }
    
    if (!currentSubjectData) {
        console.log(`paperId ${paperId} 没有找到对应的科目数据`);
        return null;
    }
    
    console.log(`paperId ${paperId} 的当前科目数据字段:`, Object.keys(currentSubjectData));
    
    // 检查必要字段
    if (!currentSubjectData.improveBar) {
        console.log(`paperId ${paperId} 缺少improveBar数据`);
        return null;
    }
    
    // 使用科目自己的levelList，如果没有则使用全局的
    const levelList = currentSubjectData.levelList || subjectData.result.levelList;
    if (!levelList || levelList.length === 0) {
        console.log(`paperId ${paperId} 缺少levelList数据`);
        return null;
    }
    
    const level = currentSubjectData.improveBar.levelScale;
    const offset = currentSubjectData.improveBar.offset;
    const totalNum = currentSubjectData.statTotalNum || subjectData.result.statTotalNum;
    
    console.log(`paperId ${paperId} 的基础数据:`, { level, offset, totalNum });
    
    // 查找对应等第的边界
    const levelInfo = levelList.find(l => l.name === level);
    if (!levelInfo) {
        console.log(`paperId ${paperId} 未找到等第 ${level} 的边界信息`);
        console.log('可用等第:', levelList.map(l => l.name));
        return { level, rank: '未知', total: totalNum };
    }
    
    console.log(`paperId ${paperId} 的等第信息:`, levelInfo);
    
    // 计算排名：总人数 * (等第下界 + (1 - offset/100) * (等第上界 - 等第下界)) / 100
    const rankFloat = totalNum * (levelInfo.lowBound + (1 - offset / 100) * (levelInfo.upperBound - levelInfo.lowBound)) / 100;
    const rank = Math.ceil(rankFloat);
    
    console.log(`科目paperId ${paperId} 排名计算详情:`, {
        level,
        offset,
        totalNum,
        levelInfo,
        计算公式: `${totalNum} * (${levelInfo.lowBound} + (1 - ${offset}/100) * (${levelInfo.upperBound} - ${levelInfo.lowBound})) / 100`,
        rankFloat,
        rank
    });
    
    return {
        level,
        rank,
        total: totalNum,
        paperId // 添加paperId用于调试
    };
}

// 修改 createSubjectScoresCard 函数中的HTML结构
function createSubjectScoresCard(paperList, levelTrend, subjectLevelTrend) {
    if (!Array.isArray(paperList) || paperList.length === 0) {
        return '<div class="detail-card"><h4>📚 科目成绩</h4><p>暂无科目数据</p></div>';
    }
    
    console.log('创建科目成绩卡片，参数:', { paperList: paperList.length, levelTrend: !!levelTrend, subjectLevelTrend: Object.keys(subjectLevelTrend || {}) });
    
    let html = `
        <div class="subject-scores-section">
            <h4>📚 各科成绩详情</h4>
            <div class="subjects-grid">
    `;
    
    paperList.forEach(paper => {
        const percentage = ((paper.userScore / paper.standardScore) * 100).toFixed(1);
        const tagInfo = getTagInfo(paper.tag);
        
        console.log(`处理科目 ${paper.subjectName} (${paper.paperId})`);
        
        // 获取该科目的班级排名信息 - 使用单科排名数据
        const subjectRankInfo = getSubjectClassRankInfo(paper.paperId, subjectLevelTrend);
        console.log(`科目 ${paper.subjectName} 排名信息:`, subjectRankInfo);
        
        html += `
            <div class="subject-card">
                <div class="subject-header">
                    <div class="subject-name">${paper.subjectName}</div>
                    <div class="subject-level level-${paper.userLevel || 'unknown'}">${paper.userLevel || '未知'}</div>
                </div>
                <div class="subject-score-main">
                    <div class="score-display">
                        <span class="current-score">${paper.userScore}</span>
                        <span class="score-separator">/</span>
                        <span class="max-score">${paper.standardScore}</span>
                    </div>
                    <div class="score-percentage">${percentage}%</div>
                </div>
                
                <!-- 科目排名信息 - 班级等第与排名在同一行 -->
                ${subjectRankInfo ? `
                <div class="subject-rank-info">
                    <div class="rank-row">
                        <div class="rank-item">
                            <span class="rank-label">班级等第:</span>
                            <span class="rank-value class-level">${subjectRankInfo.level}</span>
                        </div>
                        <div class="rank-item">
                            <span class="rank-label">班级排名:</span>
                            <span class="rank-value class-rank">${subjectRankInfo.rank}/${subjectRankInfo.total}</span>
                        </div>
                    </div>
                </div>
                ` : `
                <div class="subject-rank-info">
                    <div class="rank-row">
                        <div class="rank-item">
                            <span class="rank-label" style="color: #999;">排名数据:</span>
                            <span class="rank-value" style="color: #999;">暂无数据</span>
                        </div>
                    </div>
                </div>
                `}
                
                ${tagInfo ? `
                <div class="subject-tag tag-${tagInfo.code}">
                    <span class="tag-icon">${getTagIcon(tagInfo.code)}</span>
                    <span class="tag-text">${tagInfo.name}</span>
                </div>
                ` : ''}
                <div class="score-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${percentage}%"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// 获取标签信息
function getTagInfo(tag) {
    if (!tag) return null;
    
    return {
        code: tag.code || 'unknown',
        name: tag.name || '未知'
    };
}

// 获取标签图标
function getTagIcon(tagCode) {
    const iconMap = {
        'excellent': '⭐',
        'good': '👍',
        'normal': '📝',
        'poor': '📉',
        'unknown': '❓'
    };
    
    return iconMap[tagCode] || '📝';
}


// 添加全局事件委托来处理考试项目点击
function bindGlobalExamClickEvents() {
    const dataDisplay = document.getElementById('dataDisplay');
    
    dataDisplay.addEventListener('click', function(e) {
        // 查找最近的考试项目元素
        const examItem = e.target.closest('.exam-item[data-exam-id]');
        
        if (examItem) {
            e.preventDefault();
            e.stopPropagation();
            
            const examId = examItem.getAttribute('data-exam-id');
            const examName = examItem.getAttribute('data-exam-name');
            
            console.log('事件委托捕获到考试项目点击:', examId, examName);
            
            if (examId && examName) {
                showExamDetail(examId, examName);
            } else {
                console.error('考试ID或名称缺失:', { examId, examName });
                showError('考试信息缺失，无法查看详情');
            }
        }
    });
}

// 简化原来的 bindExamItemEvents 函数
function bindExamItemEvents() {
    // 现在由事件委托处理，这个函数可以简化或移除
    const examItems = document.querySelectorAll('.exam-item[data-exam-id]');
    console.log('考试项目数量:', examItems.length);
    
    // 只需要添加视觉效果
    examItems.forEach(item => {
        item.style.cursor = 'pointer';
        if (!item.classList.contains('clickable')) {
            item.classList.add('clickable');
        }
    });
}

// 获取总分的班级排名信息
function getClassRankInfo(levelTrend) {
    if (!levelTrend || !levelTrend.result || !levelTrend.result.list || levelTrend.result.list.length === 0) {
        return null;
    }
    
    // 总分通常是第一个项目，或者有特殊标识
    let totalData = null;
    
    // 查找总分数据
    for (let i = 0; i < levelTrend.result.list.length; i++) {
        const item = levelTrend.result.list[i];
        
        // 方法1: 通过标签判断是否为总分
        if (item.tag && (item.tag.code === 'total' || item.tag.name === '总分')) {
            totalData = item;
            break;
        }
        
        // 方法2: 通过科目名称判断
        if (item.subjectName === '总分' || item.title === '全科' || item.title === '总分') {
            totalData = item;
            break;
        }
        
        // 方法3: 如果没有明确标识，通常第一个就是总分
        if (i === 0 && !item.subjectName) {
            totalData = item;
            break;
        }
    }
    
    // 如果还是没找到，尝试使用第一个项目
    if (!totalData && levelTrend.result.list.length > 0) {
        totalData = levelTrend.result.list[0];
    }
    
    if (!totalData || !totalData.improveBar || !totalData.levelList) {
        console.log('未找到总分排名数据');
        return null;
    }
    
    const level = totalData.improveBar.levelScale;
    const offset = totalData.improveBar.offset;
    const totalNum = totalData.statTotalNum;
    
    // 查找对应等第的边界
    const levelInfo = totalData.levelList.find(l => l.name === level);
    if (!levelInfo) {
        return { level, rank: '未知', total: totalNum };
    }
    
    // 计算排名
    const rankFloat = totalNum * (levelInfo.lowBound + (1 - offset / 100) * (levelInfo.upperBound - levelInfo.lowBound)) / 100;
    const rank = Math.ceil(rankFloat);
    
    console.log('总分排名计算:', {
        level,
        offset,
        totalNum,
        levelInfo,
        rank
    });
    
    return {
        level,
        rank,
        total: totalNum
    };
}

// 创建总分概览卡片
function createScoreOverviewCard(reportMain, levelTrend) {
    if (!reportMain || !reportMain.result || !reportMain.result.totalScore) {
        return '<div class="detail-card"><h4>📊 成绩概览</h4><p>暂无数据</p></div>';
    }
    
    const totalScore = reportMain.result.totalScore;
    const classRankInfo = getClassRankInfo(levelTrend);
    
    let html = `
        <div class="detail-cards">
            <div class="detail-card score-overview">
                <h4>📊 全科成绩概览</h4>
                <div class="score-main">
                    <div class="total-score">
                        <span class="score-number">${totalScore.userScore}</span>
                        <span class="score-divider">/</span>
                        <span class="full-score">${totalScore.standardScore}</span>
                    </div>
                    <div class="score-label">总分</div>
                </div>
                <div class="score-details">
                    <div class="detail-row">
                        <div class="detail-item">
                            <span class="detail-label">年级等第:</span>
                            <span class="detail-value grade-level">${totalScore.userLevel || '未知'}</span>
                        </div>
                        ${classRankInfo ? `
                        <div class="detail-item">
                            <span class="detail-label">班级等第:</span>
                            <span class="detail-value class-level">${classRankInfo.level}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">班级排名:</span>
                            <span class="detail-value class-rank">${classRankInfo.rank}/${classRankInfo.total}</span>
                        </div>
                        ` : `
                        <div class="detail-item">
                            <span class="detail-label">班级排名:</span>
                            <span class="detail-value" style="color: #999;">暂无数据</span>
                        </div>
                        `}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// 显示考试详情页面
function displayExamDetail(examDetail) {
    console.log('显示考试详情，完整数据结构:', examDetail);
    console.log('subjectLevelTrend keys:', Object.keys(examDetail.subjectLevelTrend || {}));
    
    const dataDisplay = document.getElementById('dataDisplay');
    
    let html = `
        <div class="exam-detail">
            <div class="exam-detail-header">
                <div class="exam-detail-title">${examDetail.examName}</div>
                <button class="back-btn" id="backToListBtn">返回列表</button>
            </div>
    `;
    
    // 总评信息卡片
    if (examDetail.reportMain) {
        html += createScoreOverviewCard(examDetail.reportMain, examDetail.levelTrend);
    }
    
    // 科目成绩卡片 - 传递单科排名数据
    if (examDetail.reportMain && examDetail.reportMain.result && examDetail.reportMain.result.paperList) {
        console.log('准备创建科目成绩卡片，参数检查:');
        console.log('- paperList length:', examDetail.reportMain.result.paperList.length);
        console.log('- levelTrend exists:', !!examDetail.levelTrend);
        console.log('- subjectLevelTrend exists:', !!examDetail.subjectLevelTrend);
        console.log('- subjectLevelTrend keys:', Object.keys(examDetail.subjectLevelTrend || {}));
        
        html += createSubjectScoresCard(
            examDetail.reportMain.result.paperList, 
            examDetail.levelTrend, 
            examDetail.subjectLevelTrend // 确保传递单科排名数据
        );
    }
    
    html += '</div>';
    
    dataDisplay.innerHTML = html;
    
    // 绑定返回按钮事件
    setTimeout(() => {
        const backBtn = document.querySelector('.back-btn');
        if (backBtn) {
            backBtn.onclick = function() {
                console.log('返回按钮被点击');
                backToExamList();
            };
        }
    }, 100);
}

// 返回考试列表
function backToExamList() {
    if (currentData) {
        displayExamListData(currentData);
    } else {
        showReady();
    }
}

// 将返回函数添加到全局作用域
window.backToExamList = backToExamList;



// 定期检查标签页状态
let tabCheckInterval = null;

// 启动标签页检查（仅在需要时）
function startTabChecking() {
    if (tabCheckInterval) {
        clearInterval(tabCheckInterval);
    }
    
    // 减少检查频率到60秒，并且只在必要时更新UI
    tabCheckInterval = setInterval(() => {
        // 只有在没有显示考试详情或考试列表时才进行检查
        const dataDisplay = document.getElementById('dataDisplay');
        const displayContent = dataDisplay.innerHTML;
        
        // 如果当前正在显示考试详情或考试列表，不要干扰
        if (displayContent.includes('考试详情') || 
            displayContent.includes('考试列表') || 
            displayContent.includes('各科成绩详情')) {
            return;
        }
        
        checkZhixueTabs();
    }, 60000); // 改为60秒检查一次
}

// 停止标签页检查
function stopTabChecking() {
    if (tabCheckInterval) {
        clearInterval(tabCheckInterval);
        tabCheckInterval = null;
    }
}

// 在扩展关闭时清理定时器
window.addEventListener('beforeunload', function() {
    stopTabChecking();
});
