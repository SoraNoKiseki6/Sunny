// ==UserScript==
// @name         JD 抢券大师（真实点击 v1.2.1-点亮增强）
// @namespace    http://tampermonkey.net/
// @version      1.2.1.1
// @description  多按钮记录、定时刷新后点击、循环抢券、即时生效设置、真实测试功能、ESC 终止。新增点亮版模式：在设定时间按设置先点击再刷新循环执行。测试按钮可分别测试普通与点亮模式。支持 pro、prodev 与 h5static 域名。
// @match        https://pro.m.jd.com/*
// @match        https://prodev.m.jd.com/*
// @match        https://h5static.m.jd.com/*
// @grant        none
// @updateURL   https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd.js
// @downloadURL https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd.js
// ==/UserScript==

(function(){
'use strict';

// —— 存储 Key & 默认设置 ——
const FLAG_KEY   = 'JD_CLICK_FLAG';
const SEL_KEY    = 'JD_SELECTORS';
const CFG_KEY    = 'JD_CFG';
const defaults = {
    scheduleTime:  '10:00:00',
    advanceMs:     200,
    clickCount:    3,
    clickInterval: 100,
    refreshDelay:  200,
    buttonLimit:   4,
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
        const tag = el.nodeName.toLowerCase() + (idx>1?`:nth-of-type(${idx})`: '');
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
              'background:#fff;border:1px solid #333;padding:10px;font-size:12px;';
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
    <div style="margin-top:5px;color:#555;font-size:10px;">
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
        runClickLoop();
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
            runClickLoop();
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

// —— 点击循环 ——
let stopped = false;
async function runClickLoop(){
    stopped = false;
    console.log(`[流程]开始点击 共${cfg.clickCount}次 间隔${cfg.clickInterval}ms`);
    for(const p of selectors){
        const el = queryByPath(p);
        if(!el){ console.warn(`[流程]找不到按钮:${p}`); continue; }
        for(let i=0; i<cfg.clickCount; i++){
            if(stopped) return;
            simulateRealClick(el);
            await new Promise(r=>setTimeout(r, cfg.clickInterval));
        }
    }
    if(stopped) return;
    await new Promise(r=>setTimeout(r, cfg.refreshDelay));
    sessionStorage.setItem(FLAG_KEY,'1');
    location.reload();
}

document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
        stopped=true;
        if(reloadTimerId) clearTimeout(reloadTimerId);
        alert('已停止循环点击与定时刷新');
    }
});

// —— 页面入口 ——
if(sessionStorage.getItem(FLAG_KEY)==='1'){
    sessionStorage.removeItem(FLAG_KEY);
    runClickLoop();
} else {
    scheduleProcess();
}

})();
