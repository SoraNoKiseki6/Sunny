// ==UserScript==
// @name         京东抢券任务器
// @namespace    http://tampermonkey.net/
// @version      2.6.18
// @description  响应式布局的多线程抢券任务面板，支持手机使用，临时任务与按时间分组管理，任务组可编辑任务项，加载/取消执行，日志实时输出，服务器时间校准，折叠，任务组拖动排序，批量添加到多个任务组，耗时取整显示
// @match        *://api.m.jd.com/*
// @grant        GM_addStyle
// @updateURL   https://afan888.soranokiseki.dpdns.org/https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// @downloadURL https://afan888.soranokiseki.dpdns.org/https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd1.js
// ==/UserScript==

(function () {
    'use strict';

    let taskCounter = 1;
    const tasks = []; // 存储已加载任务的配置和停止方法

    let serverTsBase = 0;
    let perfSend = 0;

    async function calibrateServerTime() {
        try {
            const perfStart = performance.now();
            const res = await fetch('https://api.m.jd.com', { method: 'GET', credentials: 'include' });
            const perfEnd = performance.now();
            const xid = res.headers.get('X-API-Request-Id');
            if (!xid || xid.length < 13) return;
            serverTsBase = parseInt(xid.slice(-13), 10);
            perfSend = perfEnd - (perfEnd - perfStart) / 2;
        } catch (err) {
            console.warn('时间校准失败，使用本地时间代替', err);
            alert('❌ 时间校准失败，已使用本地时间代替');
            serverTsBase = Date.now();
            perfSend = performance.now();
        }
    }
    function now() {
        return serverTsBase + (performance.now() - perfSend);
    }

    function parseServerTimestamp(str) {
        const [h, m, s] = str.split(':').map(Number);
        const serverNowDate = new Date(now());
        const year = serverNowDate.getFullYear();
        const month = serverNowDate.getMonth();
        const date = serverNowDate.getDate();
        const d = new Date(year, month, date, h, m, s, 0);
        if (d.getTime() <= now()) d.setDate(d.getDate() + 1);
        return d.getTime();
    }

    function formatMs(ms) {
        ms = Math.max(0, Math.floor(ms));
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

    function appendLog(el, msg, color = '#ccc') {
        const pre = document.createElement('pre');
        pre.style.color = color;
        pre.textContent = `[${timestamp()}] ${msg}`;
        el.appendChild(pre);
        el.scrollTop = el.scrollHeight;
    }

    function updateTaskLayout() {
        const container = document.getElementById('tasks');
        Array.from(container.children).forEach(el => {
            el.style.flex = el.classList.contains('collapsed') ? '0 0 auto' : '1 1 0';
        });
    }

    function getGroups() {
        const raw = localStorage.getItem('JD_TASK_GROUPS');
        return raw ? JSON.parse(raw) : {};
    }
    function saveGroups(obj) {
        localStorage.setItem('JD_TASK_GROUPS', JSON.stringify(obj));
    }
    function deleteGroup(name) {
        const g = getGroups(); delete g[name]; saveGroups(g);
    }

    function renderGroupPanel() {
        const existing = document.querySelector('.group-panel');
        if (existing) existing.remove();
        const groups = getGroups();
        const names = Object.keys(groups);
        if (names.length === 0) return;

        const panel = document.createElement('div'); panel.className = 'group-panel';
        names.forEach(name => {
            const row = document.createElement('div'); row.className = 'group-row'; row.draggable = true; row.dataset.name = name;
            row.innerHTML = `
                <input type="checkbox" class="group-select" data-name="${name}" />
                <span class="drag-handle" title="拖动排序">☰</span>
                <input type="text" class="edit-group-name" value="${name}" />
                <span class="group-time">${groups[name].time}</span>
                <button class="btn-load" data-name="${name}">加载</button>
                <button class="btn-cancel" data-name="${name}">取消</button>
                <button class="btn-edit-group" data-name="${name}">编辑任务</button>
                <button class="btn-del-group" data-name="${name}">删除</button>
            `;
            row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
            row.addEventListener('dragend', () => row.classList.remove('dragging'));
            row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drag-over'); });
            row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
            row.addEventListener('drop', e => {
                e.preventDefault(); row.classList.remove('drag-over');
                const dragged = e.dataTransfer.getData('text/plain'); const target = name;
                if (dragged === target) return;
                const oldOrder = names.slice(); const draggedIdx = oldOrder.indexOf(dragged); const targetIdx = oldOrder.indexOf(target);
                const newOrder = [];
                oldOrder.forEach(n => { if (n === dragged) return; if (n === target) { if (draggedIdx < targetIdx) { newOrder.push(n); newOrder.push(dragged); } else { newOrder.push(dragged); newOrder.push(n); } } else { newOrder.push(n); } });
                const newGroups = {};
                newOrder.forEach(n => { newGroups[n] = groups[n]; }); saveGroups(newGroups); renderGroupPanel();
            });
            panel.appendChild(row);
        });
        document.querySelector('#panel .panel-top').insertAdjacentElement('afterend', panel);
        panel.querySelectorAll('.btn-load').forEach(btn => btn.onclick = () => onLoadGroup(btn.dataset.name));
        panel.querySelectorAll('.btn-cancel').forEach(btn => { btn.onclick = () => { tasks.forEach(t => t.stop()); tasks.length = 0; document.getElementById('tasks').innerHTML = ''; updateTaskLayout(); }; });
        panel.querySelectorAll('.btn-del-group').forEach(btn => { btn.onclick = () => { if (confirm(`确认删除任务组 "${btn.dataset.name}" 吗？`)) { deleteGroup(btn.dataset.name); renderGroupPanel(); } }; });
        panel.querySelectorAll('.edit-group-name').forEach(input => { input.onblur = () => { const oldName = input.defaultValue; const newName = input.value.trim(); if (!newName) { input.value = oldName; return; } const g = getGroups(); if (newName !== oldName && g[newName]) { alert('组名已存在'); input.value = oldName; return; } if (newName !== oldName) { g[newName] = g[oldName]; delete g[oldName]; saveGroups(g); renderGroupPanel(); } }; });
        panel.querySelectorAll('.btn-edit-group').forEach(btn => btn.onclick = () => onEditGroup(btn.dataset.name));
    }

    function onLoadGroup(name) {
        const groups = getGroups(); const groupObj = groups[name]; const list = groupObj.tasks || [];
        tasks.forEach(t => t.stop()); tasks.length = 0; document.getElementById('tasks').innerHTML = '';
        list.forEach(cfg => { const h = createTask(cfg.url, groupObj.time, cfg.advanceMs, cfg.intervalMs, cfg.totalDuration, cfg.threads, cfg.taskName); tasks.push(h); });
        updateTaskLayout();
    }

    function onEditGroup(name) {
        const groups = getGroups(); const groupObj = groups[name]; const list = groupObj.tasks || [];
        const row = document.querySelector(`.btn-edit-group[data-name="${name}"]`).parentElement;
        let next = row.nextElementSibling;
        if (next && next.classList.contains('edit-panel')) { next.remove(); return; }
        document.querySelectorAll('.edit-panel').forEach(el => el.remove());

        const panel = document.createElement('div'); panel.className = 'edit-panel';
        const editRows = document.createElement('div'); editRows.className = 'edit-rows'; panel.appendChild(editRows);

        function saveRows() {
            const newList = [];
            panel.querySelectorAll('.edit-row').forEach(r => {
                const taskName = r.querySelector('.edit-task-name').value.trim();
                const url = r.querySelector('.edit-url').value.trim();
                const advanceMs = parseInt(r.querySelector('.edit-adv').value, 10) || 0;
                const intervalMs = parseInt(r.querySelector('.edit-intv').value, 10) || 0;
                const threads = parseInt(r.querySelector('.edit-threads').value, 10) || 1;
                const totalDuration = parseInt(r.querySelector('.edit-duration').value, 10) || 0;
                if (url) {
                    newList.push({ taskName, url, advanceMs, intervalMs, threads, totalDuration });
                    tasks.slice().forEach(t => {
                        const c = t.config;
                        if (c.url === url && c.taskName === taskName) {
                            t.stop(); t.box.remove();
                            tasks.splice(tasks.indexOf(t), 1);
                        }
                    });
                }
            });
            groupObj.tasks = newList; saveGroups(groups);
        }

        list.forEach(cfg => {
            const r = document.createElement('div'); r.className = 'edit-row';
            r.innerHTML = `
                <input class="edit-task-name" value="${cfg.taskName || ''}" placeholder="任务名" />
                <input class="edit-url" value="${cfg.url}" placeholder="URL" />
                <input class="edit-adv" type="number" value="${cfg.advanceMs}" placeholder="提前(ms)" />
                <input class="edit-intv" type="number" value="${cfg.intervalMs}" placeholder="间隔(ms)" />
                <input class="edit-threads" type="number" value="${cfg.threads}" placeholder="并发" />
                <input class="edit-duration" type="number" value="${cfg.totalDuration}" placeholder="时长(ms)" />
                <button class="btn-del-row">删除</button>
            `;
            editRows.appendChild(r);
            r.querySelectorAll('input').forEach(input => input.onblur = saveRows);
            r.querySelector('.btn-del-row').onclick = () => { r.remove(); saveRows(); };
        });
        row.insertAdjacentElement('afterend', panel);
    }

    function createTask(url, timeStr, advanceMs, intervalMs, totalDuration, threads, taskName) {
        const targetTs = parseServerTimestamp(timeStr);
        const fireTs = targetTs - advanceMs;
        const delay = Math.max(0, fireTs - now());
        const box = document.createElement('div'); box.className = 'task';
        box.innerHTML = `
            <div class="task-header">
                <div class="title-box">
                    <span class="task-title">${taskName}</span>
                    <span class="countdown">倒计时：${formatMs(targetTs - now())}</span>
                </div>
                <div class="task-buttons">
                    <button class="toggle-btn">折叠</button>
                    <button class="test-btn">测试</button>
                    <button class="del-btn">删除</button>
                </div>
            </div>
            <div class="log"></div>
        `;
        document.getElementById('tasks').appendChild(box); updateTaskLayout();

        const cdEl = box.querySelector('.countdown');
        const logEl = box.querySelector('.log');
        const toggleBtn = box.querySelector('.toggle-btn');
        const testBtn = box.querySelector('.test-btn');
        const delBtn = box.querySelector('.del-btn');
        const countdownId = setInterval(() => {
            const rem = targetTs - now();
            cdEl.textContent = `倒计时：${formatMs(rem)}`;
        }, 100);

        async function runner(id, endTime) {
            while (now() < endTime) {
                const t0 = now();
                try {
                    const res = await fetch(url, { credentials: 'include' });
                    const text = await res.text();
                    const dur = Math.round(now() - t0);
                    appendLog(logEl, `线程${id} (${dur}ms): ${text.slice(0, 200)}...`);
                } catch (err) {
                    const dur = Math.round(now() - t0);
                    appendLog(logEl, `线程${id} 错误 (${dur}ms): ${err}`, 'orange');
                }
                await new Promise(r => setTimeout(r, Math.random() * intervalMs));
            }
        }
        function execTask() {
            const endTime = now() + totalDuration;
            for (let i = 1; i <= threads; i++) runner(i, endTime);
        }
        const startId = setTimeout(execTask, delay);

        toggleBtn.onclick = () => { if (box.classList.contains('collapsed')) { box.classList.remove('collapsed'); toggleBtn.textContent = '折叠'; } else { box.classList.add('collapsed'); toggleBtn.textContent = '展开'; } updateTaskLayout(); };
        testBtn.onclick = () => execTask();
        delBtn.onclick = () => { clearTimeout(startId); clearInterval(countdownId); box.remove(); const idx = tasks.findIndex(t => t.box === box); if (idx !== -1) tasks.splice(idx, 1); updateTaskLayout(); };

        tasks.push({ config: { url, timeStr, advanceMs, intervalMs, totalDuration, threads, taskName }, stop: () => { clearTimeout(startId); clearInterval(countdownId); }, box });
        return { config: { url, timeStr, advanceMs, intervalMs, totalDuration, threads, taskName }, stop: () => { clearTimeout(startId); clearInterval(countdownId); }, box };
    }

    function setupUI() {
        const ui = document.createElement('div'); ui.id = 'panel';
        ui.innerHTML = `
            <div class="panel-top">
                <div class="row first-row">
                    <input id="url" type="text" placeholder="粘贴 API URL" />
                    <input id="task-name" type="text" placeholder="任务名称可选" />
                    <button id="add-temp">添加临时任务</button>
                    <button id="add-to-group">添加到任务组</button>
                </div>
                <div class="row second-row">
                    <label>时间<input id="time" type="text" value="10:00:00"></label>
                    <label>提前(ms)<input id="adv" type="number" value="500"></label>
                    <label>间隔(ms)<input id="intv" type="number" value="50"></label>
                    <label>并发<input id="threads" type="number" value="3"></label>
                    <label>时长(ms)<input id="duration" type="number" value="2500"></label>
                </div>
            </div>
            <div id="tasks"></div>
        `;
        document.body.appendChild(ui);
        renderGroupPanel();

        document.getElementById('add-temp').onclick = () => {
            const url = document.getElementById('url').value.trim();
            const taskName = document.getElementById('task-name').value.trim() || `#${taskCounter}`;
            const timeStr = document.getElementById('time').value.trim();
            const advanceMs = Math.max(0, parseInt(document.getElementById('adv').value, 10));
            const intervalMs = Math.max(0, parseInt(document.getElementById('intv').value, 10));
            const totalDuration = Math.max(0, parseInt(document.getElementById('duration').value, 10));
            const threads = Math.max(1, parseInt(document.getElementById('threads').value, 10));
            if (!url || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(timeStr)) return alert('URL 不能为空，且时间须为 HH:mm:ss 格式');
            for (const t of tasks) {
                const c = t.config;
                if (c.url === url && c.timeStr === timeStr && c.advanceMs === advanceMs && c.intervalMs === intervalMs && c.totalDuration === totalDuration && c.threads === threads) return alert('检测到重复任务，已禁止添加');
            }
            createTask(url, timeStr, advanceMs, intervalMs, totalDuration, threads, taskName);
            taskCounter++;
            document.getElementById('url').value = '';
            document.getElementById('task-name').value = '';
        };

        document.getElementById('add-to-group').onclick = () => {
            const url = document.getElementById('url').value.trim();
            const taskName = document.getElementById('task-name').value.trim() || `#${taskCounter}`;
            const timeInput = document.getElementById('time').value.trim();
            const advanceMs = Math.max(0, parseInt(document.getElementById('adv').value, 10));
            const intervalMs = Math.max(0, parseInt(document.getElementById('intv').value, 10));
            const totalDuration = Math.max(0, parseInt(document.getElementById('duration').value, 10));
            const threads = Math.max(1, parseInt(document.getElementById('threads').value, 10));
            if (!url || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(timeInput)) return alert('URL 不能为空，且时间须为 HH:mm:ss 格式');
            const groups = getGroups();
            const checked = Array.from(document.querySelectorAll('.group-select:checked')).map(el => el.dataset.name);
            if (checked.length === 0) {
                let targetGroup = Object.keys(groups).find(n => groups[n].time === timeInput);
                if (!targetGroup) {
                    targetGroup = timeInput; groups[targetGroup] = { time: timeInput, tasks: [] };
                }
                const list = groups[targetGroup].tasks;
                const exists = list.some(cfg => cfg.url === url && cfg.advanceMs === advanceMs && cfg.intervalMs === intervalMs && cfg.totalDuration === totalDuration && cfg.threads === threads);
                if (!exists) { list.push({ url, taskName, advanceMs, intervalMs, threads, totalDuration }); saveGroups(groups); renderGroupPanel(); taskCounter++; document.getElementById('url').value = ''; document.getElementById('task-name').value = ''; }
                else alert('当前时间组中已存在相同任务');
            } else {
                let anyAdded = false;
                checked.forEach(name => {
                    const groupObj = groups[name]; const list = groupObj.tasks;
                    const exists = list.some(cfg => cfg.url === url && cfg.advanceMs === advanceMs && cfg.intervalMs === intervalMs && cfg.totalDuration === totalDuration && cfg.threads === threads);
                    if (!exists) { list.push({ url, taskName, advanceMs, intervalMs, threads, totalDuration }); anyAdded = true; }
                });
                if (anyAdded) { saveGroups(groups); renderGroupPanel(); taskCounter++; document.getElementById('url').value = ''; document.getElementById('task-name').value = ''; document.querySelectorAll('.group-select:checked').forEach(el => el.checked = false); }
                else alert('所选组中已存在相同任务');
            }
        };
    }

    GM_addStyle(`
        /* 响应式整体面板 */
        #panel { position: fixed; top: 0; left: 0; bottom: 0; width: 100%; display: flex; flex-direction: column; padding: 8px; background: #1e1e1e; color: #fff; font-size: 14px; z-index: 999999; box-sizing: border-box; }
        .panel-top { flex: 0 0 auto; margin-bottom: 8px; }
        .row { display: flex; gap: 8px; margin-bottom: 6px; /*no wrap by default*/ flex-wrap: nowrap; }
        .first-row input { flex: 1 1 200px; /*fixed min*/ min-width: 120px; padding: 6px; background: #333; color: #fff; border: none; border-radius: 4px; font-size: 14px; }
        .first-row button { flex: 0 0 100px; min-width: 80px; padding: 6px; background: #007acc; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; font-size: 14px; }
        .second-row { display: flex; justify-content: space-between; flex-wrap: nowrap; }
        .second-row label { flex: 1 1 140px; min-width: 100px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #ccc; }
        .second-row input { flex: 1 1 100px; min-width: 80px; padding: 4px; background: #333; color: #fff; border: none; border-radius: 4px; font-size: 13px; }
        @media (max-width: 768px) {
            .row { flex-wrap: wrap; }
            .first-row input { flex: 1 1 45%; }
            .first-row button { flex: 1 1 45%; }
            .second-row { flex-wrap: wrap; }
            .second-row label { flex: 1 1 45%; margin-bottom: 6px; }
        }
        .group-panel { background: #2b2b2b; padding: 6px; border-radius: 4px; margin-bottom: 8px; overflow-x: auto; }
        .group-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; padding: 4px; border: 1px solid #555; border-radius: 4px; background: #3a3a3a; flex-wrap: wrap; }
        .group-row.dragging { opacity: 0.5; }
        .group-row.drag-over { border-color: #007acc; }
        .drag-handle { cursor: move; margin-right: 4px; }
        .group-select { margin-right: 4px; }
        .edit-group-name { flex: 1 1 120px; min-width: 80px; padding: 2px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; }
        .group-time { color: #0af; font-size: 12px; margin-right: 8px; white-space: nowrap; }
        .group-row button { background: #444; color: #fff; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; min-width: 60px; }
        .edit-panel { background: #333; padding: 6px; margin: 4px 0; border-radius: 4px; overflow-x: auto; }
        .edit-rows { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
        .edit-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
        .edit-row input { padding: 2px; background: #222; color: #fff; border: none; border-radius: 4px; font-size: 12px; }
        .edit-row input.edit-url { flex: 2 1 200px; min-width: 120px; }
        .edit-row input:not(.edit-url) { flex: 1 1 80px; min-width: 60px; }
        .btn-del-row { background: #dc3545; color: #fff; border: none; padding: 2px 4px; border-radius: 4px; cursor: pointer; font-size: 12px; min-width: 50px; }
        #tasks { flex: 1 1 auto; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
        .task { background: #2d2d2d; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; flex: 1 1 0; overflow: hidden; transition: flex 0.2s; }
        .task.collapsed .log { display: none; }
        .task-header { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; }
        .title-box { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 120px; }
        .task-title { font-weight: bold; font-size: 14px; color: #ffd700; flex: 1 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .countdown { font-size: 12px; color: #0af; white-space: nowrap; }
        .task-buttons button { margin-left: 4px; padding: 2px 6px; font-size: 12px; background: #444; color: #fff; border: none; border-radius: 4px; cursor: pointer; min-width: 50px; }
        .log { flex: 1 1 auto; background: #111; padding: 4px; font-size: 12px; overflow-y: auto; border-radius: 4px; }
        .log pre { margin: 2px 0; white-space: pre-wrap; word-break: break-word; }
    `);

    window.addEventListener('keydown', e => { if (e.key === 'Escape') tasks.forEach(t => t.stop()); });

    calibrateServerTime().finally(() => { setupUI(); window.addEventListener('resize', updateTaskLayout); });
})();
