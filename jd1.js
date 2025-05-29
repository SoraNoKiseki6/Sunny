// ==UserScript==
// @name         定时刷新当前页面（每标签页独立设置+互不影响）
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  每个标签页单独设置定时刷新，支持倒计时、进度条、ESC终止任务，刷新状态与设置均在当前页有效。
// @author       GPT
// @match        *://api.m.jd.com/*
// @updateURL   https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// @downloadURL https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // 生成当前标签页唯一任务标识（sessionStorage 保持，标签页关闭即失效）
    let taskTag = sessionStorage.getItem('jd_unique_task_id');
    if (!taskTag) {
        taskTag = 'task_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('jd_unique_task_id', taskTag);
    }
    console.log(`当前任务标识: ${taskTag}`);

    // 每标签页独立配置（存储在 sessionStorage）
    let config = JSON.parse(sessionStorage.getItem(`${taskTag}_config`) || '{}');
    config.timePoints = config.timePoints || [];
    config.advanceMs = config.advanceMs || 0;
    config.intervalMs = config.intervalMs || 500;
    config.maxTimes = config.maxTimes || 1;

    let refreshing = sessionStorage.getItem(`${taskTag}_refreshing`) === 'true';
    let refreshCounter = parseInt(sessionStorage.getItem(`${taskTag}_refreshCounter`) || '0');

    let countdownTimer = null;
    let refreshTimer = null;

    function parseTimeStr(str) {
        const [h, m, s] = str.split(':').map(Number);
        if ([h, m, s].some(x => isNaN(x) || x < 0 || h > 23 || m > 59 || s > 59)) return null;
        const now = new Date();
        const target = new Date();
        target.setHours(h, m, s, 0);
        if (target < now) target.setDate(target.getDate() + 1);
        return target;
    }

    function getNextTargetTime() {
        const now = new Date();
        const targets = config.timePoints.map(parseTimeStr).filter(t => t !== null).sort((a, b) => a - b);
        return targets.find(t => t - config.advanceMs > now);
    }

    function msToTime(ms) {
        if (ms < 0) ms = 0;
        const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
        const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
        const msStr = String(ms % 1000).padStart(3, '0');
        return `${h}:${m}:${s}.${msStr}`;
    }

    function createUI() {
        const panel = document.createElement('div');
        panel.id = 'tm-setting-panel';
        panel.innerHTML = `
    <div id="tm-header">
        ⚙️ 定时刷新设置 <span style="font-size:12px; color:#ccc;">（任务编号: ${taskTag}）</span>
        <span id="tm-toggle">⬆️</span>
    </div>
    <div id="tm-body">
                <label>目标时间点 (HH:MM:SS, 多个用逗号):<br><input id="tm-times" style="width: 100%" placeholder="12:00:00,18:30:00" value="${config.timePoints.join(',')}"></label><br>
                <label>提前时间 (毫秒):<br><input id="tm-advance" type="number" step="50" min="0" value="${config.advanceMs}"></label><br>
                <label>刷新间隔 (毫秒):<br><input id="tm-interval" type="number" step="50" min="50" value="${config.intervalMs}"></label><br>
                <label>每个时间点最大刷新次数:<br><input id="tm-max" type="number" min="1" value="${config.maxTimes}"></label><br>
                <button id="tm-save">保存设置</button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('tm-save').addEventListener('click', () => {
            const timesRaw = document.getElementById('tm-times').value;
            const timesArr = timesRaw.split(',').map(t => t.trim()).filter(Boolean);
            const validTimes = timesArr.filter(t => parseTimeStr(t) !== null);
            if (validTimes.length === 0) {
                alert('请至少输入一个有效的时间点，格式如 HH:MM:SS');
                return;
            }
            config.timePoints = validTimes;
            config.advanceMs = Math.max(0, parseInt(document.getElementById('tm-advance').value) || 0);
            config.intervalMs = Math.max(50, parseInt(document.getElementById('tm-interval').value) || 500);
            config.maxTimes = Math.max(1, parseInt(document.getElementById('tm-max').value) || 1);

            sessionStorage.setItem(`${taskTag}_config`, JSON.stringify(config));
            sessionStorage.removeItem(`${taskTag}_refreshing`);
            sessionStorage.removeItem(`${taskTag}_refreshCounter`);
            refreshing = false;
            refreshCounter = 0;

            setupCountdown();
            alert('设置已保存，本标签页生效。');
        });

        document.getElementById('tm-toggle').addEventListener('click', () => {
            const body = document.getElementById('tm-body');
            const toggle = document.getElementById('tm-toggle');
            if (body.style.display === 'none') {
                body.style.display = 'block';
                toggle.textContent = '⬆️';
            } else {
                body.style.display = 'none';
                toggle.textContent = '⬇️';
            }
        });
    }

    function createCountdownUI() {
        const countdown = document.createElement('div');
        countdown.id = 'tm-countdown';
        countdown.style.display = 'none';
        document.body.appendChild(countdown);

        const progress = document.createElement('div');
        progress.id = 'tm-progress';
        progress.style.display = 'none';
        document.body.appendChild(progress);
    }

    function setupCountdown() {
        if (countdownTimer) clearInterval(countdownTimer);
        const countdownEl = document.getElementById('tm-countdown');
        const nextTime = getNextTargetTime();

        if (!nextTime || config.timePoints.length === 0) {
            countdownEl.style.display = 'none';
            return;
        }

        countdownEl.style.display = 'block';
        countdownTimer = setInterval(() => {
            const now = new Date();
            const left = nextTime - now;
            countdownEl.textContent = '倒计时: ' + msToTime(left);
            if (left <= config.advanceMs && !refreshing) {
                clearInterval(countdownTimer);
                startRefreshing();
            }
        }, 33);
    }

    function startRefreshing() {
        refreshing = true;
        sessionStorage.setItem(`${taskTag}_refreshing`, 'true');
        refreshCounter = parseInt(sessionStorage.getItem(`${taskTag}_refreshCounter`) || '0');

        const progressEl = document.getElementById('tm-progress');
        progressEl.style.display = 'block';
        progressEl.style.width = `${(refreshCounter / config.maxTimes) * 100}%`;

        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            refreshCounter++;
            sessionStorage.setItem(`${taskTag}_refreshCounter`, refreshCounter.toString());

            const percent = Math.min(100, (refreshCounter / config.maxTimes) * 100);
            progressEl.style.width = percent + '%';

            if (refreshCounter >= config.maxTimes) {
                refreshing = false;
                sessionStorage.removeItem(`${taskTag}_refreshing`);
                sessionStorage.removeItem(`${taskTag}_refreshCounter`);
                progressEl.style.display = 'none';
                setupCountdown();
            } else {
                location.reload();
            }
        }, config.intervalMs);
    }

    function stopAll() {
        if (refreshTimer) clearTimeout(refreshTimer);
        if (countdownTimer) clearInterval(countdownTimer);
        const progressEl = document.getElementById('tm-progress');
        const countdownEl = document.getElementById('tm-countdown');
        if (progressEl) progressEl.style.display = 'none';
        if (countdownEl) countdownEl.style.display = 'none';
        refreshing = false;
        sessionStorage.removeItem(`${taskTag}_refreshing`);
        sessionStorage.removeItem(`${taskTag}_refreshCounter`);
    }

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            stopAll();
            alert('刷新任务已终止');
        }
    });

    GM_addStyle(`
        #tm-setting-panel { position: fixed; bottom: 10px; right: 10px; background: #222; color: #eee;
            padding: 12px; border-radius: 12px; width: 320px; z-index: 999999; box-shadow: 0 0 15px #000; }
        #tm-setting-panel label { display: block; margin-bottom: 8px; }
        #tm-setting-panel input, #tm-setting-panel button { width: 100%; padding: 6px; margin-top: 4px; border-radius: 6px; }
        #tm-setting-panel button { background: #1e90ff; color: white; border: none; font-weight: bold; }
        #tm-header { font-weight: bold; font-size: 16px; display: flex; justify-content: space-between; cursor: pointer; }
        #tm-toggle { font-size: 18px; }
        #tm-countdown { position: fixed; top: 10px; right: 10px; background: #111; color: #0f0;
            padding: 6px 12px; border-radius: 8px; font-family: monospace; font-size: 14px; z-index: 999999; }
        #tm-progress { position: fixed; top: 45px; right: 10px; width: 140px; height: 8px;
            background: #222; border-radius: 6px; overflow: hidden; z-index: 999999; }
    `);

    function init() {
        createUI();
        createCountdownUI();
        if (refreshing) {
            const progressEl = document.getElementById('tm-progress');
            progressEl.style.display = 'block';
            progressEl.style.width = `${(refreshCounter / config.maxTimes) * 100}%`;
            startRefreshing();
        } else if (config.timePoints.length > 0) {
            setupCountdown();
        }
    }

    init();
})();
