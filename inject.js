(function() {
    'use strict';

    let examListData = null; // 存储考试列表数据的变量
    let academicYearData = null; // 存储学年数据的变量
    let currentPageIndex = 1; // 当前页码
    let currentModal = null; // 当前弹窗引用
    let selectedAcademicYear = null; // 当前选择的学年

    // 获取学年信息的函数
    async function getAcademicYear() {
        try {
            console.log('🔍 正在获取学年信息...');
            const xToken = localStorage.getItem('xToken');
            globalThis.xToken = xToken;
            
            if (!xToken) {
                console.error('❌ 未找到xToken，请确保已登录');
                return null;
            }

            console.log('🔑 获取学年信息，使用xToken:', xToken);

            const response = await fetch('https://www.zhixue.com/zhixuebao/base/common/academicYear', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'xtoken': xToken
                },
                credentials: 'include'
            });

            console.log('📡 学年信息请求响应状态:', response.status, response.statusText);

            if (response.ok) {
                const data = await response.json();
                
                console.log('✅ 学年信息获取成功！');
                console.log('📊 学年数据:', data);
                
                // 存储在变量中
                academicYearData = data;
                window.academicYearData = data;
                
                console.log('💾 学年数据已存储在变量 academicYearData 和 window.academicYearData 中');
                
                return data;
            } else {
                console.error('❌ 获取学年信息失败:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('❌ 错误详情:', errorText);
                return null;
            }
        } catch (error) {
            console.error('💥 获取学年信息时发生错误:', error);
            console.error('💥 错误堆栈:', error.stack);
            return null;
        }
    }

    // 获取考试列表的函数
    async function getExamList(pageIndex = 1, academicYear = null) {
        try {
            // 构建URL，使用pageIndex作为查询参数
            let url = `/zhixuebao/report/exam/getUserExamList?pageIndex=${pageIndex}&pageSize=10`;
            
            // 如果选择了学年，添加学年查询参数
            if (academicYear) {
                url += `&startSchoolYear=${academicYear.beginTime}&endSchoolYear=${academicYear.endTime}`;
                console.log('📅 使用学年筛选:', academicYear.name, `(${academicYear.beginTime} - ${academicYear.endTime})`);
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'xtoken': xToken
                },
                credentials: 'include'
            });

            console.log('📡 请求响应状态:', response.status, response.statusText);

            if (response.ok) {
                const data = await response.json();
                
                console.log(`✅ 第${pageIndex}页考试列表获取成功！`);
                console.log('📊 响应数据:', data);
                
                // 存储在变量中
                examListData = data;
                window.examListData = data;
                
                console.log('💾 数据已存储在变量 examListData 和 window.examListData 中');
                
                return data;
            } else {
                console.error('❌ 获取考试列表失败:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('❌ 错误详情:', errorText);
                return null;
            }
        } catch (error) {
            console.error('💥 获取考试列表时发生错误:', error);
            console.error('💥 错误堆栈:', error.stack);
            return null;
        }
    }

    // 获取考试详情
    async function getExamDetail(examId, examDetailType, academicYear) {
        console.log(`获取考试详情: examId=${examId}, type=${examDetailType}, academicYear=`, academicYear);
        
        const xToken = localStorage.getItem('xToken');
        globalThis.xToken = xToken;

        if (!examId || !examDetailType) {
            throw new Error('缺少考试ID或详情类型参数');
        }
        
        
        // 构建基础URL
        let url = `/zhixuebao/report/exam/${examDetailType}?examId=${examId}&&startSchoolYear=${academicYear.beginTime}&endSchoolYear=${academicYear.endTime}`;
        
        // 如果有学年参数，添加到URL中
        if (academicYear && academicYear.startTime && academicYear.endTime) {
            const startSchoolYear = Math.floor(academicYear.startTime / 1000);
            const endSchoolYear = Math.floor(academicYear.endTime / 1000);
            url += `&startSchoolYear=${startSchoolYear}&endSchoolYear=${endSchoolYear}`;
            console.log(`添加学年参数到 ${examDetailType}: startSchoolYear=${startSchoolYear}, endSchoolYear=${endSchoolYear}`);
        }
        
        console.log(`请求 ${examDetailType} URL:`, url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'xtoken': xToken
                },
                credentials: 'include'
            });
            
            console.log(`${examDetailType} HTTP响应状态:`, response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`${examDetailType} 获取成功:`, data);
            
            return data;
        } catch (error) {
            console.error(`获取 ${examDetailType} 失败:`, error);
            throw error;
        }
    }

    // 获取单科排名详情
    async function getSubjectLevelTrend(examId, paperId, academicYear) {
        console.log(`获取单科排名详情: examId=${examId}, paperId=${paperId}, academicYear=`, academicYear);
        
                    console.log('🔍 正在获取学年信息...');
        const xToken = localStorage.getItem('xToken');
        globalThis.xToken = xToken;
        
        if (!examId || !paperId) {
            throw new Error('缺少考试ID或试卷ID参数');
        }
        
        // 构建URL，添加学年参数
        let url = `/zhixuebao/report/paper/getLevelTrend?examId=${examId}&paperId=${paperId}&&startSchoolYear=${academicYear.beginTime}&endSchoolYear=${academicYear.endTime}`;
        
        // 如果有学年参数，添加到URL中
        if (academicYear && academicYear.startTime && academicYear.endTime) {
            const startSchoolYear = Math.floor(academicYear.startTime / 1000);
            const endSchoolYear = Math.floor(academicYear.endTime / 1000);
            url += `&startSchoolYear=${startSchoolYear}&endSchoolYear=${endSchoolYear}`;
            console.log(`添加学年参数: startSchoolYear=${startSchoolYear}, endSchoolYear=${endSchoolYear}`);
        }
        
        console.log('请求单科排名URL:', url);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'xtoken': xToken
                },
                credentials: 'include'
            });
            
            console.log('单科排名HTTP响应状态:', response.status, response.statusText);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`单科排名获取成功:`, data);
            
            return data;
        } catch (error) {
            console.error(`获取单科排名失败:`, error);
            throw error;
        }
    }

    // 格式化时间戳
    function formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
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

    // 更新考试列表内容
    function updateExamList(examContainer, examData) {
        // 清空现有内容
        examContainer.innerHTML = '';

        // 检查是否有考试数据
        if (examData.result && examData.result.examList && examData.result.examList.length > 0) {
            // 添加考试项目
            examData.result.examList.forEach(exam => {
                const examItem = document.createElement('div');
                examItem.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px;
                    border: 2px solid ${exam.isFinal ? '#28a745' : '#ffc107'};
                    border-radius: 8px;
                    background: ${exam.isFinal ? '#f8fff9' : '#fffbf0'};
                    transition: transform 0.2s;
                    margin-bottom: 10px;
                `;

                // 添加悬停效果
                examItem.addEventListener('mouseenter', () => {
                    examItem.style.transform = 'translateY(-2px)';
                    examItem.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                });
                examItem.addEventListener('mouseleave', () => {
                    examItem.style.transform = 'translateY(0)';
                    examItem.style.boxShadow = 'none';
                });

                // 考试名称
                const examName = document.createElement('div');
                examName.textContent = exam.examName;
                examName.style.cssText = `
                    font-weight: bold;
                    font-size: 16px;
                    color: #333;
                    flex: 2;
                `;

                // 考试时间
                const examTime = document.createElement('div');
                examTime.textContent = formatDate(exam.examCreateDateTime);
                examTime.style.cssText = `
                    color: #666;
                    flex: 1;
                    text-align: center;
                `;

                // 考试类型
                const examType = document.createElement('div');
                examType.textContent = getExamTypeName(exam.examType);
                examType.style.cssText = `
                    color: #888;
                    flex: 1;
                    text-align: center;
                `;

                // 状态标识
                const statusBadge = document.createElement('div');
                statusBadge.textContent = exam.isFinal ? '已完成' : '进行中';
                statusBadge.style.cssText = `
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    color: white;
                    background: ${exam.isFinal ? '#28a745' : '#ffc107'};
                `;

                examItem.appendChild(examName);
                examItem.appendChild(examTime);
                examItem.appendChild(examType);
                examItem.appendChild(statusBadge);

                examContainer.appendChild(examItem);
            });
        } else {
            // 没有考试时的显示
            const noExamMessage = document.createElement('div');
            noExamMessage.style.cssText = `
                text-align: center;
                padding: 40px 20px;
                color: #666;
                font-size: 16px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 2px dashed #dee2e6;
            `;
            
            const selectedYearName = selectedAcademicYear ? selectedAcademicYear.name : '当前学年';
            noExamMessage.innerHTML = `
                <div style="font-size: 24px; margin-bottom: 10px;">📝</div>
                <div style="font-weight: bold; margin-bottom: 5px;">${selectedYearName}无考试</div>
                <div style="font-size: 14px; color: #999;">该学年暂时没有考试记录</div>
            `;
            
            examContainer.appendChild(noExamMessage);
        }
    }

    // 创建学年选择下拉框
    function createAcademicYearSelector(modal, examContainer, paginationButtons) {
        const selectorContainer = document.createElement('div');
        selectorContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        `;

        const label = document.createElement('label');
        label.textContent = '选择学年：';
        label.style.cssText = `
            font-weight: bold;
            color: #333;
        `;

        const select = document.createElement('select');
        select.style.cssText = `
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            font-size: 14px;
            min-width: 150px;
        `;

        // 添加学年选项
        if (academicYearData && academicYearData.result) {
            academicYearData.result.forEach((year, index) => {
                const option = document.createElement('option');
                option.value = JSON.stringify(year);
                option.textContent = year.name;
                // 默认选择第一个学年（最新学年）
                if (index === 0) {
                    option.selected = true;
                    selectedAcademicYear = year;
                }
                select.appendChild(option);
            });
        }

        // 选择变更事件
        select.addEventListener('change', async () => {
            const selectedValue = select.value;
            selectedAcademicYear = selectedValue ? JSON.parse(selectedValue) : null;
            
            console.log('🔄 学年选择变更:', selectedAcademicYear ? selectedAcademicYear.name : '未选择');
            
            // 重置页码并重新获取数据
            currentPageIndex = 1;
            
            // 显示加载状态
            examContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">加载中...</div>';
            
            const newData = await getExamList(1, selectedAcademicYear);
            
            if (newData) {
                updateExamList(examContainer, newData);
                // 更新分页按钮状态
                updatePaginationButtons(paginationButtons);
            }
        });

        selectorContainer.appendChild(label);
        selectorContainer.appendChild(select);

        return selectorContainer;
    }

    // 创建翻页按钮
    function createPaginationButtons(modal, examContainer) {
        const paginationContainer = document.createElement('div');
        paginationContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin: 20px 0;
        `;

        // 上一页按钮
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '上一页';
        prevBtn.style.cssText = `
            padding: 8px 16px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;

        // 页码显示
        const pageInfo = document.createElement('span');
        pageInfo.style.cssText = `
            padding: 8px 16px;
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 4px;
            font-size: 14px;
            min-width: 80px;
            text-align: center;
        `;

        // 下一页按钮
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '下一页';
        nextBtn.style.cssText = `
            padding: 8px 16px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;

        // 更新页码显示和按钮状态
        function updatePagination() {
            pageInfo.textContent = `第 ${currentPageIndex} 页`;
            prevBtn.disabled = currentPageIndex <= 1;
            prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
            prevBtn.style.cursor = prevBtn.disabled ? 'not-allowed' : 'pointer';
            
            // 根据hasNextPage决定下一页按钮状态
            if (examListData && examListData.result) {
                nextBtn.disabled = !examListData.result.hasNextPage;
                nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
                nextBtn.style.cursor = nextBtn.disabled ? 'not-allowed' : 'pointer';
            }
        }

        // 上一页事件
        prevBtn.addEventListener('click', async () => {
            if (currentPageIndex > 1) {
                prevBtn.textContent = '加载中...';
                prevBtn.disabled = true;
                
                currentPageIndex--;
                const newData = await getExamList(currentPageIndex, selectedAcademicYear);
                
                if (newData) {
                    updateExamList(examContainer, newData);
                    updatePagination();
                } else {
                    currentPageIndex++; // 恢复页码
                }
                
                prevBtn.textContent = '上一页';
                prevBtn.disabled = false;
            }
        });

        // 下一页事件
        nextBtn.addEventListener('click', async () => {
            if (examListData && examListData.result && examListData.result.hasNextPage) {
                nextBtn.textContent = '加载中...';
                nextBtn.disabled = true;
                
                currentPageIndex++;
                const newData = await getExamList(currentPageIndex, selectedAcademicYear);
                
                if (newData) {
                    updateExamList(examContainer, newData);
                    updatePagination();
                } else {
                    currentPageIndex--; // 恢复页码
                }
                
                nextBtn.textContent = '下一页';
                nextBtn.disabled = false;
            }
        });

        // 初始化页码显示
        updatePagination();

        // 存储更新函数供外部调用
        paginationContainer.updatePagination = updatePagination;

        paginationContainer.appendChild(prevBtn);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(nextBtn);

        return paginationContainer;
    }

    // 更新分页按钮状态
    function updatePaginationButtons(paginationButtons) {
        if (paginationButtons && paginationButtons.updatePagination) {
            paginationButtons.updatePagination();
        }
    }

    // 创建考试列表弹窗
    async function createExamListModal(examData) {
        // 如果还没有学年数据，先获取
        if (!academicYearData) {
            const yearData = await getAcademicYear();
            if (!yearData) {
                alert('获取学年信息失败，无法显示学年选择器');
            }
        }

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        // 创建弹窗
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 10px;
            padding: 20px;
            max-width: 90%;
            max-height: 90%;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;

        // 创建标题
        const title = document.createElement('h2');
        title.textContent = '考试列表';
        title.style.cssText = `
            margin: 0 0 20px 0;
            text-align: center;
            color: #333;
        `;
        modal.appendChild(title);

        // 创建考试列表容器
        const examContainer = document.createElement('div');
        examContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 600px;
        `;

        // 创建翻页按钮
        const paginationButtons = createPaginationButtons(modal, examContainer);

        // 创建学年选择器
        const academicYearSelector = createAcademicYearSelector(modal, examContainer, paginationButtons);
        modal.appendChild(academicYearSelector);

        // 如果有学年数据，默认选择第一个学年并获取数据
        if (academicYearData && academicYearData.result && academicYearData.result.length > 0) {
            selectedAcademicYear = academicYearData.result[0];
            const firstYearData = await getExamList(1, selectedAcademicYear);
            updateExamList(examContainer, firstYearData || examData);
        } else {
            // 初始化考试列表
            updateExamList(examContainer, examData);
        }
        
        modal.appendChild(examContainer);

        // 添加翻页按钮
        modal.appendChild(paginationButtons);

        // 创建关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = `
            margin-top: 20px;
            padding: 10px 20px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            display: block;
            margin-left: auto;
            margin-right: auto;
        `;

        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            currentModal = null;
        });

        // 点击遮罩层也可以关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                currentModal = null;
            }
        });

        modal.appendChild(closeBtn);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        currentModal = modal;
    }

    // 创建UI界面
    function createUI() {
        const button = document.createElement('button');
        button.textContent = '';
        button.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 9999;
            padding: 10px;
            background-color: #ffffff;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        `;

        button.addEventListener('click', async () => {
            console.log('🚀 开始获取考试列表...');
            button.textContent = '获取中...';
            button.disabled = true;
            
            // 重置页码
            currentPageIndex = 1;
            
            // 先获取学年信息，然后使用第一个学年获取考试列表
            if (!academicYearData) {
                await getAcademicYear();
            }
            
            // 使用第一个学年获取考试列表
            if (academicYearData && academicYearData.result && academicYearData.result.length > 0) {
                selectedAcademicYear = academicYearData.result[0];
                const examList = await getExamList(1, selectedAcademicYear);
                
                if (examList !== null) {
                    console.log('🎉 操作完成！打开考试列表弹窗');
                    await createExamListModal(examList);
                } else {
                    console.log('❌ 操作失败！请查看上方的错误信息');
                    alert('获取考试列表失败，请检查控制台错误信息');
                }
            } else {
                console.log('❌ 无法获取学年信息');
                alert('无法获取学年信息，请检查网络连接和登录状态');
            }
            
            button.textContent = '获取考试列表';
            button.disabled = false;
        });

        document.body.appendChild(button);
    }

    // 等待页面加载完成后创建UI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }

    // 将函数和数据暴露到全局，方便调试
    window.zhixueHelper = {
        getExamList: getExamList,
        getAcademicYear: getAcademicYear,
        examListData: () => examListData,
        academicYearData: () => academicYearData,
        currentPage: () => currentPageIndex,
        selectedYear: () => selectedAcademicYear,
        showData: () => {
            if (examListData) {
                console.log('📊 当前存储的考试列表数据:', examListData);
                console.table(examListData);
                return examListData;
            } else {
                console.log('❌ 暂无数据，请先获取考试列表');
                return null;
            }
        }
    };

    console.log('🔧 智学网考试列表获取助手已加载');
    console.log('🎯 使用 window.zhixueHelper.showData() 可随时查看已获取的数据');

    // 通知content script脚本已加载
window.postMessage({
    type: 'SCRIPT_LOADED'
}, '*');

// 监听来自扩展的消息
window.addEventListener('message', async function(event) {
    if (event.source !== window) return;
    
    if (event.data.type === 'FROM_EXTENSION') {
        console.log('注入脚本收到消息:', event.data);
        const action = event.data.action;
        let response = { success: false, error: 'Unknown action' };
        
        try {
            switch (action) {
                case 'getAcademicYear':
                    console.log('执行获取学年信息...');
                    const yearData = await getAcademicYear();
                    if (yearData) {
                        response = { success: true, data: yearData };
                        console.log('学年信息获取成功:', yearData);
                    } else {
                        response = { success: false, error: '获取学年信息失败' };
                    }
                    break;
                    
                case 'getExamList':
                    console.log('执行获取考试列表...');
                    const examData = await getExamList(
                        event.data.pageIndex || 1,
                        event.data.academicYear || null
                    );
                    if (examData) {
                        response = { success: true, data: examData };
                        console.log('考试列表获取成功:', examData);
                    } else {
                        response = { success: false, error: '获取考试列表失败' };
                    }
                    break;
                    
                case 'getExamDetail':
                    console.log('执行获取考试详情...', event.data);
                    try {
                        const examId = event.data.examId;
                        const examDetailType = event.data.examDetailType;
                        const academicYear = event.data.academicYear; // 添加学年参数
                        
                        console.log('接收到的参数:', { examId, examDetailType, academicYear });
                        
                        if (!examId || !examDetailType) {
                            throw new Error(`缺少必要参数: examId=${examId}, examDetailType=${examDetailType}`);
                        }
                        
                        const detailData = await getExamDetail(examId, examDetailType, academicYear);
                        if (detailData) {
                            response = { success: true, data: detailData };
                            console.log('考试详情获取成功:', detailData);
                        } else {
                            response = { success: false, error: '获取考试详情失败' };
                        }
                    } catch (detailError) {
                        console.error('获取考试详情时出错:', detailError);
                        response = { success: false, error: detailError.message };
                    }
                    break;
                    
                case 'getSubjectLevelTrend':
                    console.log('执行获取单科排名...', event.data);
                    try {
                        const examId = event.data.examId;
                        const paperId = event.data.paperId;
                        const academicYear = event.data.academicYear; // 添加学年参数
                        
                        console.log('接收到的单科排名参数:', { examId, paperId, academicYear });
                        
                        if (!examId || !paperId) {
                            throw new Error(`缺少必要参数: examId=${examId}, paperId=${paperId}`);
                        }
                        
                        const subjectData = await getSubjectLevelTrend(examId, paperId, academicYear);
                        if (subjectData) {
                            response = { success: true, data: subjectData };
                            console.log('单科排名获取成功:', subjectData);
                        } else {
                            response = { success: false, error: '获取单科排名失败' };
                        }
                    } catch (subjectError) {
                        console.error('获取单科排名时出错:', subjectError);
                        response = { success: false, error: subjectError.message };
                    }
                    break;
                    
                default:
                    response = { success: false, error: '未知的操作类型: ' + action };
            }
        } catch (error) {
            console.error('操作执行出错:', error);
            response = { success: false, error: error.message };
        }
        
        console.log('发送响应:', response);
        
        // 发送响应回扩展
        window.postMessage({
            type: 'TO_EXTENSION',
            data: response
        }, '*');
    }
});

})();