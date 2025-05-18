// ==UserScript==
// @name         JD 刷新可交互耗时测试器（持久化设置）
// @namespace    http://tampermonkey.net/
// @version      1.0.6
// @description  连续刷新 n 次并测量刷新触发到脚本执行的耗时，支持持久化测试次数与间隔，仅匹配 pro.m.jd.com/* 。
// @match        https://pro.m.jd.com/*
// @match        https://prodev.m.jd.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
  'use strict';

  // -- 配置项存储键 --
  const COUNT_KEY   = 'reload_test_count';
  const DELAY_KEY   = 'reload_test_delay';
  const REMAIN_KEY  = 'reload_test_remaining';
  const START_KEY   = 'reload_test_start';
  const RESULTS_KEY = 'reload_test_results';

  // -- 默认值 --
  const DEFAULT_COUNT = 5;
  const DEFAULT_DELAY = 200; // ms

  // -- 读取/保存配置 --
  function getConfigCount() {
    return GM_getValue(COUNT_KEY, DEFAULT_COUNT);
  }
  function getConfigDelay() {
    return GM_getValue(DELAY_KEY, DEFAULT_DELAY);
  }
  function setConfig(count, delay) {
    GM_setValue(COUNT_KEY, count);
    GM_setValue(DELAY_KEY, delay);
    alert(`已保存配置：次数=${count}, 间隔=${delay}ms`);
  }

  // -- 菜单命令：设置测试次数和刷新间隔 --
  GM_registerMenuCommand('设置刷新测试次数 & 间隔', () => {
    const c = parseInt(prompt('测试刷新次数 n（正整数）：', getConfigCount()), 10);
    if (isNaN(c) || c <= 0) return alert('次数无效，未保存');
    const d = parseInt(prompt('每次刷新后等待间隔（毫秒）：', getConfigDelay()), 10);
    if (isNaN(d) || d < 0) return alert('间隔无效，未保存');
    setConfig(c, d);
    // 重新初始化 remaining 并重载
    sessionStorage.setItem(REMAIN_KEY, c);
    sessionStorage.setItem(START_KEY, Date.now());
    sessionStorage.setItem(RESULTS_KEY, JSON.stringify([]));
    location.reload();
  });

  // -- 初始化测试状态 --
  let remaining = parseInt(sessionStorage.getItem(REMAIN_KEY) || '-1', 10);
  if (remaining < 1) {
    // 第一次运行或已结束，则初始化
    remaining = getConfigCount();
    sessionStorage.setItem(REMAIN_KEY, remaining);
    sessionStorage.setItem(START_KEY, Date.now());
    sessionStorage.setItem(RESULTS_KEY, JSON.stringify([]));
    console.log(`[测试] 初始化：次数=${remaining}, 间隔=${getConfigDelay()}ms`);
    location.reload();
    return;
  }

  // -- 测量耗时并循环刷新 --
  window.addEventListener('load', () => {
    const start = parseInt(sessionStorage.getItem(START_KEY), 10);
    const delta = Date.now() - start;
    console.log(`[测试] 第 ${getConfigCount() - remaining + 1} 次耗时：${delta} ms`);

    // 保存结果
    const results = JSON.parse(sessionStorage.getItem(RESULTS_KEY));
    results.push(delta);
    sessionStorage.setItem(RESULTS_KEY, JSON.stringify(results));

    // 更新 remaining
    remaining--;
    sessionStorage.setItem(REMAIN_KEY, remaining);

    if (remaining > 0) {
      // 安排下一轮
      sessionStorage.setItem(START_KEY, Date.now());
      setTimeout(() => location.reload(), getConfigDelay());
    } else {
      // 全部完成，计算平均并显示
      const arr = results;
      const sum = arr.reduce((a, b) => a + b, 0);
      const avg = (sum / arr.length).toFixed(2);
      alert(
        `刷新可交互耗时测试完成（${arr.length} 次）：\n` +
        arr.map((t, i) => `第${i+1}次: ${t} ms`).join('\n') +
        `\n平均耗时: ${avg} ms\n` +
        `测试间隔: ${getConfigDelay()} ms`
      );
      console.log('[测试] 详细结果：', arr, '平均：', avg);
      // 清理状态
      sessionStorage.removeItem(REMAIN_KEY);
      sessionStorage.removeItem(START_KEY);
      sessionStorage.removeItem(RESULTS_KEY);
    }
  });
})();
