// ==UserScript==
// @name         京东抢券任务器（改进版）
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  动态自适应界面，任务独立执行，使用 setTimeout 精准触发，实时倒计时显示
// @match        *://api.m.jd.com/*
// @grant        GM_addStyle
// @updateURL   https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// @downloadURL https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// ==/UserScript==

(function () {
    'use strict';

    let taskCounter = 1;
    const tasks = [];

    function parseTime(str) {
        const [h, m, s] = str.split(':').map(Number);
        const now = new Date();
        const target = new Date();
        target.setHours(h, m, s, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        return target;
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
        const d = new Date();
        return `${d.toLocaleTimeString('zh-CN', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    }

    function logMessage(el, msg, color = '#ccc') {
        const pre = document.createElement('pre');
        pre.style.color = color;
        pre.textContent = `[${timestamp()}] ${msg}`;
        el.appendChild(pre);
        el.scrollTop = el.scrollHeight;
        console.log(`[任务日志] ${msg}`);
    }

    function createTask(url, timeStr, advanceMs, intervalMs, maxTimes, taskName) {
        const targetDate = parseTime(timeStr);
        const targetTimestamp = targetDate.getTime();
        const fireTimestamp = targetTimestamp - advanceMs;
        const now = Date.now();
        const delay = Math.max(0, fireTimestamp - now);

        const box = document.createElement('div');
        box.className = 'task';
        box.innerHTML = `
            <div class="task-header">
                <span class="task-title">任务 #${taskName}</span>
                <div class="task-buttons">
                    <button class="test-btn">测试</button>
                    <button class="del-btn">删除</button>
                </div>
            </div>
            <div class="countdown">倒计时：${formatMs(targetTimestamp - now)}</div>
            <div class="log"></div>
        `;
        document.getElementById('tasks').appendChild(box);

        const cdEl = box.querySelector('.countdown');
        const logEl = box.querySelector('.log');
        const testBtn = box.querySelector('.test-btn');
        const delBtn = box.querySelector('.del-btn');

        let sentCount = 0;
        let running = true;
        let requestTimerId = null;
        let countdownIntervalId = null;

        // 实时更新倒计时显示
        countdownIntervalId = setInterval(() => {
            const remaining = targetTimestamp - Date.now();
            cdEl.textContent = `倒计时：${formatMs(remaining)}`;
        }, 100);

        // 在 delay 毫秒后启动第一次 sendOnce，之后循环
        requestTimerId = setTimeout(() => {
            if (!running) return;
            sendOnce();
        }, delay);

        function sendOnce() {
            if (!running || sentCount >= maxTimes) return;
            sentCount++;
            const startTime = Date.now();
            fetch(url, { credentials: 'include' })
                .then(res => res.text())
                .then(text => {
                    const duration = Date.now() - startTime;
                    logMessage(logEl, `#${sentCount} 响应 (${duration}ms): ${text.slice(0, 200)}...`);
                })
                .catch(err => {
                    const duration = Date.now() - startTime;
                    logMessage(logEl, `#${sentCount} 错误 (${duration}ms): ${err}`, 'orange');
                })
                .finally(() => {
                    setTimeout(sendOnce, intervalMs);
                });
        }

        testBtn.onclick = () => {
            const now2 = Date.now();
            fetch(url, { credentials: 'include' })
                .then(res => res.text())
                .then(text => {
                    const duration = Date.now() - now2;
                    logMessage(logEl, `立即测试响应 (${duration}ms): ${text.slice(0, 200)}...`, '#0f0');
                })
                .catch(err => {
                    const duration = Date.now() - now2;
                    logMessage(logEl, `立即测试错误 (${duration}ms): ${err}`, 'red');
                });
        };

        delBtn.onclick = () => {
            running = false;
            clearTimeout(requestTimerId);
            clearInterval(countdownIntervalId);
            box.remove();
        };

        return {
            stop: () => {
                running = false;
                clearTimeout(requestTimerId);
                clearInterval(countdownIntervalId);
            }
        };
    }

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
                    <label>时间
                        <input id="time" type="text" value="10:00:00">
                    </label>
                    <label>提前(ms)
                        <input id="adv" type="number" value="800">
                    </label>
                    <label>间隔(ms)
                        <input id="intv" type="number" value="100">
                    </label>
                    <label>次数
                        <input id="max" type="number" value="25">
                    </label>
                </div>
            </div>
            <div id="tasks"></div>
            <div id="test-log"></div>
        `;
        document.body.appendChild(ui);

        document.getElementById('add').onclick = () => {
            const url = document.getElementById('url').value.trim();
            const timeStr = document.getElementById('time').value.trim();
            const advanceMs = Math.max(0, parseInt(document.getElementById('adv').value, 10));
            const intervalMs = Math.max(10, parseInt(document.getElementById('intv').value, 10));
            const maxTimes = Math.max(1, parseInt(document.getElementById('max').value, 10));

            if (!url || !timeStr) return;
            const taskHandle = createTask(url, timeStr, advanceMs, intervalMs, maxTimes, taskCounter++);
            tasks.push(taskHandle);
            document.getElementById('url').value = '';
        };
    }

    GM_addStyle(`
        #panel {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #1e1e1e;
            color: #fff;
            padding: 8px 12px;
            font-size: 14px;
            z-index: 999999;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
        }
        .panel-top {
            flex: 0 0 auto;
            margin-bottom: 8px;
        }
        .first-row {
            display: flex;
            gap: 8px;
            margin-bottom: 6px;
        }
        .first-row input {
            flex: 1;
            padding: 6px;
            background: #333;
            color: #fff;
            border: none;
            border-radius: 4px;
        }
        .first-row button {
            padding: 6px 12px;
            background: #007acc;
            border: none;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            cursor: pointer;
        }
        .second-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
        }
        .second-row label {
            flex: 1;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            color: #ccc;
            gap: 8px;
        }
        .second-row input {
            flex: 1;
            padding: 4px;
            background: #333;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-size: 13px;
        }
        #tasks {
            flex: 1 1 auto;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .task {
            background: #2d2d2d;
            border-radius: 6px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .task-title {
            font-weight: bold;
            font-size: 14px;
            color: #ffd700;
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
        .countdown {
            font-size: 12px;
            color: #0af;
            margin-bottom: 4px;
        }
        .log {
            flex: 1 1 auto;
            background: #111;
            padding: 4px;
            font-size: 12px;
            overflow-y: auto;
            border-radius: 4px;
            color: #ccc;
            max-height: 100%;
        }
        .log pre {
            margin: 2px 0;
            white-space: pre-wrap;
            word-break: break-word;
        }
    `);

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            tasks.forEach(t => t.stop());
            console.log('已停止所有任务（ESC）');
        }
    });

    setupUI();
})();
