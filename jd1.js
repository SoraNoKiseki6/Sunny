// ==UserScript==
// @name         JD 抢券大师（真实点击 v1.2.1-点亮增强，多标签支持，日志，独立按钮任务版）
// @namespace    http://tampermonkey.net/
// @version      1.2.1.3
// @description  多按钮记录、定时刷新后点击、循环抢券、即时生效设置、真实测试功能、ESC 终止。新增点亮版模式：在设定时间按设置先点击再刷新循环执行。测试按钮可分别测试普通与点亮模式。支持 pro、prodev 与 h5static 域名。支持多标签页独立抢券任务。每个按钮独立检测点击，全部完成后刷新页面。
// @match        https://pro.m.jd.com/*
// @match        https://prodev.m.jd.com/*
// @match        https://h5static.m.jd.com/*
// @grant        none
// ==/UserScript==

(function(){
'use strict';

// —— 自动生成标签页唯一标识 ——（sessionStorage 保证同一标签页内固定、关闭失效）
let taskTag = sessionStorage.getItem('jd_unique_task_id');
if (!taskTag) {
    taskTag = 'task_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('jd_unique_task_id', taskTag);
}
console.log(`[JD抢券] 当前任务标识: ${taskTag}`);

// —— 存储 Key & 默认设置 ——（带任务标识）
const FLAG_KEY   = `JD_CLICK_FLAG_${taskTag}`;
const SEL_KEY    = `JD_SELECTORS_${taskTag}`;
const CFG_KEY    = `JD_CFG_${taskTag}`;
const defaults = {
    scheduleTime:  '10:00:00',
    advanceMs:     800,
    clickCount:    4,
    clickInterval: 150,
    refreshDelay:  100,
    buttonLimit:   1,
    dianMode:      false
};

// —— 加载/保存 配置 & 选择器列表 ——
let cfg = Object.assign({}, defaults, JSON.parse(localStorage.getItem(CFG_KEY) || '{}'));
let selectors = JSON.parse(localStorage.getItem(SEL_KEY) || '[]');
function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
function saveSel() { localStorage.setItem(SEL_KEY, JSON.stringify(selectors)); }

// —— 生成唯一 DOM 路径 ——
function getDomPath(el){
    if(!(el instanceof Element)) return '';
    const stack = [];
    while(el && el.nodeType===1 && el!==document.body){
        let idx=1, sib=el;
        while(sib=sib.previousElementSibling) if(sib.nodeName===el.nodeName) idx++;
        const tag = el.nodeName.toLowerCase() + (idx>1 ? `:nth-of-type(${idx})` : '');
        stack.unshift(tag);
        el=el.parentElement;
    }
    return stack.join(' > ');
}
function queryByPath(path){ try{ return document.querySelector(path);}catch{return null;} }

// —— 创建设置面板 ——
const panel = document.createElement('div');
panel.id = 'jd-settings-panel';
panel.style = 'position:fixed;top:10px;right:10px;z-index:9999;' +
              'background:#fff;border:1px solid #333;padding:10px;font-size:12px;max-width:260px;';
panel.innerHTML = `
    <div><b>JD 抢券大师</b></div>
    <div>时间 <input id="in-time"      value="${cfg.scheduleTime}"    style="width:70px"></div>
    <div>提前刷新 <input id="in-adv"   type="number" value="${cfg.advanceMs}"      style="width:50px"> ms</div>
    <div>点击次数 <input id="in-ct"     type="number" value="${cfg.clickCount}"     style="width:30px"></div>
    <div>点击间隔 <input id="in-ci"     type="number" value="${cfg.clickInterval}" style="width:50px"> ms</div>
    <div>刷新延迟 <input id="in-rd"     type="number" value="${cfg.refreshDelay}"  style="width:50px"> ms</div>
    <div>按钮上限 <input id="in-bl"     type="number" value="${cfg.buttonLimit}"   style="width:30px"></div>
    <div>
        点亮版模式 <input type="checkbox" id="in-dian" ${cfg.dianMode? 'checked': ''}>
    </div>
    <div style="margin-top:5px;">
        <button id="btn-save">保存设置</button>
        <button id="btn-clear">清除记录</button><br>
        <button id="btn-test1">测试按钮识别</button>
        <button id="btn-test2">测试整体流程</button>
    </div>
    <div style="margin-top:5px;color:#555;font-size:10px;word-break: break-word;">
        当前任务标识：<span style="color:#080">${taskTag}</span><br>
        请在“${cfg.scheduleTime}”前点击目标按钮，最多 ${cfg.buttonLimit} 个
    </div>
`;
document.body.appendChild(panel);

// —— 设置即时生效 ——
function applySettings(){
    cfg.scheduleTime   = document.getElementById('in-time').value;
    cfg.advanceMs      = parseInt(document.getElementById('in-adv').value)||0;
    cfg.clickCount     = parseInt(document.getElementById('in-ct').value)||1;
    cfg.clickInterval  = parseInt(document.getElementById('in-ci').value)||50;
    cfg.refreshDelay   = parseInt(document.getElementById('in-rd').value)||200;
    cfg.buttonLimit    = parseInt(document.getElementById('in-bl').value)||1;
    cfg.dianMode       = document.getElementById('in-dian').checked;
    saveCfg();
    if(reloadTimerId) clearTimeout(reloadTimerId);
    scheduleProcess();
    alert('设置已保存并立即生效');
}
document.getElementById('btn-save').onclick = applySettings;
document.getElementById('btn-clear').onclick = ()=>{
    selectors = []; saveSel(); alert('已清除所有按钮记录');
};

// —— 面板内不记录按钮 ——
let canRecord = true;
panel.addEventListener('mouseenter', ()=>canRecord=false);
panel.addEventListener('mouseleave', ()=>canRecord=true);

// —— 手动点击记录 ——
document.addEventListener('click', e=>{
    if(!canRecord) return;
    if(selectors.length>=cfg.buttonLimit) return;
    const p = getDomPath(e.target);
    if(p && !selectors.includes(p)){
        selectors.push(p);
        saveSel();
        alert(`记录成功（第${selectors.length}个）：\n${p}`);
    }
}, true);

// —— 测试按钮识别 ——
document.getElementById('btn-test1').onclick = ()=>{
    if(!selectors.length) return alert('未记录按钮');
    selectors.forEach((p,i)=>{
        const el = queryByPath(p);
        if(el){ simulateRealClick(el); console.log(`[测试1]点击第${i+1}按钮:${p}`);}
        else console.warn(`[测试1]未找到第${i+1}按钮:${p}`);
    });
};

// —— 测试整体流程 ——
document.getElementById('btn-test2').onclick = ()=>{
    if(!selectors.length) return alert('未记录按钮');
    if(cfg.dianMode){
        alert('点亮模式流程测试：先点击再循环刷新点击');
        runClickLoop(cfg, selectors);
    } else {
        alert('普通模式流程测试：刷新后循环点击');
        sessionStorage.setItem(FLAG_KEY,'1');
        location.reload();
    }
};

// —— 定时调度 ——
let reloadTimerId = null;
function scheduleProcess(){
    const [hh,mm,ss] = cfg.scheduleTime.split(':').map(Number);
    const now = Date.now();
    const target = new Date(); target.setHours(hh,mm,ss,0);
    let delay = target.getTime() - now - cfg.advanceMs;
    if(delay < 0) delay += 86400000;
    console.log(`[调度] ${delay}ms 后触发${cfg.dianMode? '点亮模式':'普通模式'}流程`);
    reloadTimerId = setTimeout(()=>{
        if(cfg.dianMode){
            runClickLoop(cfg, selectors);
        } else {
            sessionStorage.setItem(FLAG_KEY,'1');
            location.reload();
        }
    }, delay);
}

// ✅ —— 模拟真实用户点击 —— 
function simulateRealClick(el){
    const rect = el.getBoundingClientRect();
    ['mouseover','mousedown','mouseup','click'].forEach(type=>{
        const evt = new MouseEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width/2,
            clientY: rect.top + rect.height/2
        });
        el.dispatchEvent(evt);
    });
}

// —— 延迟函数
function delay(ms){
    return new Promise(resolve=>setTimeout(resolve, ms));
}

// —— 查询路径等待按钮出现 —— 
function waitForButton(path, timeout=30000, interval=200){
    const start = Date.now();
    return new Promise(resolve=>{
        const check = ()=>{
            const el = queryByPath(path);
            if(el){
                resolve(el);
            } else if(Date.now() - start > timeout){
                resolve(null);
            } else {
                setTimeout(check, interval);
            }
        };
        check();
    });
}

// —— 独立任务版点击循环 —— 
async function runClickLoop(settings, recordedSelectors){
    if(!recordedSelectors.length){
        alert('请先记录至少一个按钮');
        return;
    }

    const refreshDelay = settings.refreshDelay;
    const clickTimes = settings.clickCount;
    const clickInterval = settings.clickInterval;

    console.log(`[流程] 开始独立按钮点击任务，共 ${recordedSelectors.length} 个按钮，每个点击 ${clickTimes} 次`);

    // 并行执行每个按钮的点击任务
    const tasks = recordedSelectors.map((path, idx) => (async ()=>{
        console.log(`[任务${idx+1}] 等待按钮出现...`);
        const el = await waitForButton(path);
        if(!el){
            console.warn(`[任务${idx+1}] 按钮未出现，跳过`);
            return;
        }
        console.log(`[任务${idx+1}] 按钮已出现，开始点击`);
        for(let i=0; i<clickTimes; i++){
            simulateRealClick(el);
            console.log(`[任务${idx+1}] 第${i+1}次点击`);
            await delay(clickInterval);
        }
        console.log(`[任务${idx+1}] 点击完成`);
    })());

    await Promise.all(tasks);
    console.log(`[流程] 所有按钮点击完成，${refreshDelay}ms 后刷新页面`);
    setTimeout(()=>{
        sessionStorage.removeItem(FLAG_KEY);
        location.reload();
    }, refreshDelay);
}

// —— 页面入口 —— 
if(sessionStorage.getItem(FLAG_KEY) === '1'){
    console.log('[启动] 普通模式：页面刷新后开始点击循环');
    runClickLoop(cfg, selectors);
} else {
    console.log('[启动] 等待定时触发流程');
    scheduleProcess();
}

// —— ESC 键终止 —— 
window.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
        console.log('[终止] 用户按下 ESC，取消抢券任务');
        sessionStorage.removeItem(FLAG_KEY);
        alert('已终止抢券任务');
    }
});

})();
