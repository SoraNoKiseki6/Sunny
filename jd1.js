// ==UserScript==
// @name         京东抢券任务器（改进版·多线程+后置日志+折叠功能）
// @namespace    http://tampermonkey.net/
// @version      2.6.6
// @description  动态多线程并发，任务结束后统一打印日志，服务器时间校准，界面优化，日志折叠
// @match        *://api.m.jd.com/*
// @grant        GM_addStyle
// @updateURL   https://afan888.soranokiseki.dpdns.org/https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// @downloadURL https://afan888.soranokiseki.dpdns.org/https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// ==/UserScript==

(function () {
    'use strict';

    let taskCounter = 1;
    const tasks = [];
    let timeOffset = 0;

    // ----- 时间校准逻辑 -----
    async function calibrateServerTime() {
        try {
            const start = Date.now();
            const res = await fetch('https://api.m.jd.com/client.action?functionId=queryMaterialProducts&client=wh5', { credentials: 'include' });
            const end = Date.now();
            const serverDate = res.headers.get('date');
            if (!serverDate) throw new Error('无服务器时间');
            const serverTime = new Date(serverDate).getTime();
            const rtt = (end - start) / 2;
            timeOffset = (serverTime + rtt) - end;
        } catch (e) {
            timeOffset = 0;
        }
    }

    function now() {
        return Date.now() + timeOffset;
    }

    function parseServerTimestamp(str) {
        const [h, m, s] = str.split(':').map(Number);
        const localNow = new Date();
        const localTarget = new Date();
        localTarget.setHours(h, m, s, 0);
        if (localTarget <= localNow) localTarget.setDate(localTarget.getDate() + 1);
        return localTarget.getTime() + timeOffset;
    }

    function formatMs(ms) {
        if (ms < 0) ms = 0;
        const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
        const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
        const msStr = String(ms % 1000).padStart(3, '0');
        return `${h}:${m}:${s}.${msStr}`;
    }

    function timestamp() {
        const d = new Date(now());
        return `${d.toLocaleTimeString('zh-CN', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    }

    // ----- 日志相关 -----
    function appendLog(el, msg, color = '#ccc') {
        const pre = document.createElement('pre');
        pre.style.color = color;
        pre.textContent = `[${timestamp()}] ${msg}`;
        el.appendChild(pre);
        el.scrollTop = el.scrollHeight;
    }

    // ----- 更新任务布局逻辑 -----
    function updateTaskLayout() {
        const container = document.getElementById('tasks');
        const taskEls = Array.from(container.querySelectorAll('.task'));
        const visibleTasks = taskEls.filter(el => !el.classList.contains('collapsed'));
        const count = visibleTasks.length;
        taskEls.forEach(el => {
            if (el.classList.contains('collapsed')) {
                el.style.flex = '0 0 auto';
                el.style.height = null;
            } else {
                el.style.flex = `1 1 0`;
                el.style.height = null;
            }
        });
    }

    // ----- 任务创建逻辑 -----
    function createTask(url, timeStr, advanceMs, intervalMs, totalDuration, threads, taskName) {
        const targetServerTs = parseServerTimestamp(timeStr);
        const fireTs = targetServerTs - advanceMs;
        const delay = Math.max(0, fireTs - now());

        // 任务容器 DOM
        const box = document.createElement('div');
        box.className = 'task';
        box.innerHTML = `
            <div class="task-header">
                <div class="title-box">
                    <span class="task-title">任务 #${taskName}</span>
                    <span class="countdown">倒计时：${formatMs(targetServerTs - now())}</span>
                </div>
                <div class="task-buttons">
                    <button class="toggle-btn">折叠</button>
                    <button class="test-btn">测试任务</button>
                    <button class="del-btn">删除</button>
                </div>
            </div>
            <div class="log"></div>
        `;
        document.getElementById('tasks').appendChild(box);
        updateTaskLayout();

        const cdEl = box.querySelector('.countdown');
        const logEl = box.querySelector('.log');
        const toggleBtn = box.querySelector('.toggle-btn');
        const testBtn = box.querySelector('.test-btn');
        const delBtn = box.querySelector('.del-btn');

        // 倒计时更新
        const countdownIntervalId = setInterval(() => {
            const rem = targetServerTs - now();
            cdEl.textContent = `倒计时：${formatMs(rem)}`;
        }, 100);

        // 日志缓冲
        const logBuffer = [];
        let ended = false;

        // 多线程 runner
        async function runner(threadId, endTime) {
            while (now() < endTime) {
                const tStart = now();
                try {
                    const res = await fetch(url, { credentials: 'include' });
                    const text = await res.text();
                    const duration = now() - tStart;
                    logBuffer.push(`线程#${threadId} 响应 (${duration}ms): ${text.slice(0, 200)}...`);
                } catch (err) {
                    const duration = now() - tStart;
                    logBuffer.push(`线程#${threadId} 错误 (${duration}ms): ${err}`);
                }
                const waitTime = Math.random() * intervalMs;
                await new Promise(r => setTimeout(r, waitTime));
            }
        }

        // 执行任务（内部调用）
        function executeTask() {
            const endTime = now() + totalDuration;
            for (let i = 1; i <= threads; i++) {
                runner(i, endTime);
            }
            // 任务结束后统一打印日志
            setTimeout(() => {
                if (ended) return;
                logBuffer.forEach(line => appendLog(logEl, line));
                ended = true;
            }, totalDuration + 50);
        }

        // 定时启动
        const startTimerId = setTimeout(() => {
            executeTask();
        }, delay);

        // 折叠按钮
        toggleBtn.onclick = () => {
            if (box.classList.contains('collapsed')) {
                box.classList.remove('collapsed');
                toggleBtn.textContent = '折叠';
            } else {
                box.classList.add('collapsed');
                toggleBtn.textContent = '展开';
            }
            updateTaskLayout();
        };

        // 测试按钮：一键执行完整流程
        testBtn.onclick = () => {
            if (ended) return;
            executeTask();
        };

        // 删除按钮
        delBtn.onclick = () => {
            clearTimeout(startTimerId);
            clearInterval(countdownIntervalId);
            box.remove();
            updateTaskLayout();
        };

        tasks.push({ stop: () => {
            clearTimeout(startTimerId);
            clearInterval(countdownIntervalId);
        }});
    }

    // ----- UI 初始化 -----
    function setupUI() {
        const ui = document.createElement('div');
        ui.id = 'panel';
        ui.innerHTML = `
            <div class="panel-top">
                <div class="row first-row">
                    <input id="url" type="text" placeholder="粘贴 API URL" />
                    <button id="add">添加任务</button>
                </div>
                <div class="row second-row">
                    <label>时间<input id="time" type="text" value="10:00:00"></label>
                    <label>提前(ms)<input id="adv" type="number" value="800"></label>
                    <label>间隔(ms)<input id="intv" type="number" value="100"></label>
                    <label>并发数<input id="threads" type="number" value="3"></label>
                    <label>总时长(ms)<input id="duration" type="number" value="800"></label>
                </div>
            </div>
            <div id="tasks"></div>
        `;
        document.body.appendChild(ui);

        document.getElementById('add').onclick = () => {
            const url = document.getElementById('url').value.trim();
            const timeStr = document.getElementById('time').value.trim();
            const advanceMs = Math.max(0, parseInt(document.getElementById('adv').value, 10));
            const intervalMs = Math.max(0, parseInt(document.getElementById('intv').value, 10));
            const totalDuration = Math.max(0, parseInt(document.getElementById('duration').value, 10));
            const threads = Math.max(1, parseInt(document.getElementById('threads').value, 10));
            if (!url || !timeStr) return;
            createTask(url, timeStr, advanceMs, intervalMs, totalDuration, threads, taskCounter++);
            document.getElementById('url').value = '';
        };
    }

    // ----- 样式 -----
    GM_addStyle(`
        #panel {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 100%;
            display: flex;
            flex-direction: column;
            padding: 8px;
            background: #1e1e1e;
            color: #fff;
            font-size: 14px;
            z-index: 999999;
            box-sizing: border-box;
        }
        .panel-top {
            flex: 0 0 auto;
            margin-bottom: 8px;
        }
        .row {
            display: flex;
            gap: 8px;
            margin-bottom: 6px;
        }
        .first-row input {
            flex: 1 1 60%;
            padding: 6px;
            background: #333;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-size: 14px;
        }
        .first-row button {
            flex: 1 1 30%;
            padding: 6px;
            background: #007acc;
            border: none;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            cursor: pointer;
            font-size: 14px;
        }
        .second-row {
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
        }
        .second-row label {
            flex: 1 1 18%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            color: #ccc;
        }
        .second-row input {
            flex: 1 1 55%;
            padding: 4px;
            background: #333;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-size: 13px;
        }
        @media (max-width: 600px) {
            .second-row label {
                flex: 1 1 45%;
                margin-bottom: 6px;
            }
        }
        @media (min-width: 601px) {
            .second-row label { flex: 1 1 18%; }
        }
        #tasks {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            overflow-y: auto;
        }
        .task {
            background: #2d2d2d;
            border-radius: 6px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            flex: 1 1 0;
            overflow: hidden;
            transition: flex 0.2s;
        }
        .task.collapsed .log {
            display: none;
        }
        .task-header {
            flex: 0 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .title-box {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .task-title {
            font-weight: bold;
            font-size: 14px;
            color: #ffd700;
        }
        .countdown {
            font-size: 12px;
            color: #0af;
        }
        .task-buttons button {
            margin-left: 4px;
            padding: 2px 6px;
            font-size: 12px;
            background: #444;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .log {
            flex: 1 1 auto;
            background: #111;
            padding: 4px;
            font-size: 12px;
            overflow-y: auto;
            border-radius: 4px;
        }
        .log pre { margin: 2px 0; white-space: pre-wrap; word-break: break-word; }
    `);

    // 按 Esc 停止所有任务（停止倒计时、移除启动定时，但不影响已启动 runner）
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            tasks.forEach(t => t.stop());
        }
    });

    calibrateServerTime().finally(() => {
        setupUI();
        window.addEventListener('resize', updateTaskLayout);
    });
})();
