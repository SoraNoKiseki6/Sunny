// ==UserScript==
// @name         JD 抢券大师（多标签独立任务版 v1.3.0）
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  每个标签页自动生成独立任务，互不冲突；支持多券抢购、自动刷新+点击、测试模式、点亮版模式，ESC 停止等；兼容嵌套/灰色按钮。
// @updateURL   https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd.js
// @downloadURL https://raw.githubusercontent.com/SoraNoKiseki6/Sunny/main/jd.js
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
    advanceMs:     200,
    clickCount:    3,
    clickInterval: 100,
    refreshDelay:  200,
    buttonLimit:   4,
    dianMode:      false
};

// —— 加载配置 & 按钮列表 ——（每标签页独立）
let cfg = Object.assign({}, defaults, JSON.parse(localStorage.getItem(CFG_KEY) || '{}'));
let selectors = JSON.parse(localStorage.getItem(SEL_KEY) || '[]');
function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
function saveSel() { localStorage.setItem(SEL_KEY, JSON.stringify(selectors)); }

// —— 唯一路径获取 ——（支持嵌套按钮定位）
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
function queryByPath(path){
    try{ return document.querySelector(path); }
    catch{ return null; }
}

// —— 判断点亮页面 ——（带 .dianliang-indicator 或链接中含 'dianliang'）
function isDianliangPage(){
    return cfg.dianMode && (
        location.href.includes('dianliang') ||
        !!document.querySelector('.dianliang-indicator')
    );
}

// —— 创建设置面板 ——（带任务名）
const panel = document.createElement('div');
panel.id = 'jd-settings-panel';
panel.style = 'position:fixed;top:10px;right:10px;z-index:9999;' +
              'background:#fff;border:1px solid #333;padding:10px;font-size:12px;';
panel.innerHTML = `
    <div><b>JD 抢券大师</b>（任务：<code>${taskTag}</code>）</div>
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

// —— 设置立即生效 —— 
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
document.getElementById('in-dian').addEventListener('change', ()=>{ cfg.dianMode = document.getElementById('in-dian').checked; saveCfg(); });
document.getElementById('btn-clear').onclick = ()=>{ selectors = []; saveSel(); alert('已清除所有按钮记录'); };

// —— 面板内不记录 —— 
let canRecord = true;
panel.addEventListener('mouseenter', ()=>canRecord=false);
panel.addEventListener('mouseleave', ()=>canRecord=true);

// —— 点击记录按钮 —— 
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

// —— 测试按钮 —— 
document.getElementById('btn-test1').onclick = ()=>{
    if(!selectors.length) return alert('未记录按钮');
    selectors.forEach((p,i)=>{
        const el = queryByPath(p);
        if(el){ el.click(); console.log(`[测试1]点击第${i+1}按钮:${p}`); }
        else console.warn(`[测试1]未找到第${i+1}按钮:${p}`);
    });
};

// —— 测试流程 —— 
document.getElementById('btn-test2').onclick = ()=>{
    if(!selectors.length) return alert('未记录按钮');
    if(isDianliangPage()){
        alert('检测为点亮版页面，立即运行流程测试');
        runClickLoop();
    } else {
        sessionStorage.setItem(FLAG_KEY,'1');
        location.reload();
    }
};

// —— 定时任务调度 —— 
let reloadTimerId = null;
function scheduleProcess(){
    const [hh,mm,ss] = cfg.scheduleTime.split(':').map(Number);
    const now = Date.now();
    const target = new Date(); target.setHours(hh,mm,ss,0);
    let delay = target.getTime() - now - cfg.advanceMs;
    if(delay < 0) delay += 86400000;
    console.log(`[调度] ${delay}ms 后触发${isDianliangPage()? '点亮版流程':'刷新再点击流程'}`);
    reloadTimerId = setTimeout(()=>{
        if(isDianliangPage()){
            runClickLoop();
        } else {
            sessionStorage.setItem(FLAG_KEY,'1');
            location.reload();
        }
    }, delay);
}

// —— 循环点击主流程 —— 
let stopped = false;
async function runClickLoop(){
    stopped = false;
    console.log(`[流程]开始点击 共${cfg.clickCount}次 间隔${cfg.clickInterval}ms`);
    for(const p of selectors){
        const el = queryByPath(p);
        if(!el){ console.warn(`[流程]找不到按钮:${p}`); continue; }
        for(let i=0; i<cfg.clickCount; i++){
            if(stopped) return;
            el.click();
            await new Promise(r=>setTimeout(r, cfg.clickInterval));
        }
    }
    if(stopped) return;
    await new Promise(r=>setTimeout(r, cfg.refreshDelay));
    if(isDianliangPage()){
        runClickLoop();
    } else {
        sessionStorage.setItem(FLAG_KEY,'1');
        location.reload();
    }
}

// —— ESC 停止 —— 
document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
        stopped=true;
        if(reloadTimerId) clearTimeout(reloadTimerId);
        alert('已停止循环点击与定时刷新');
    }
});

// —— 入口 —— 
if(sessionStorage.getItem(FLAG_KEY) === '1'){
    sessionStorage.removeItem(FLAG_KEY);
    runClickLoop();
} else {
    scheduleProcess();
}

})();
