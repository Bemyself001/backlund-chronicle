/* ES5, deliberately inlined before the module entry. Do not import app code here. */
(function () {
  var started = Date.now();
  var events = [];
  var completed = false;
  var failed = false;
  var bound = false;
  var nativeInfo = null;
  var returnFocus = null;
  var manuallyOpened = false;
  var variant = document.querySelector('meta[name="startup-variant"]').content;
  var version = document.querySelector('meta[name="startup-version"]').content;
  var capabilities = {
    modules: 'noModule' in document.createElement('script'),
    structuredClone: typeof window.structuredClone === 'function',
    arrayAt: typeof Array.prototype.at === 'function',
    findLast: typeof Array.prototype.findLast === 'function',
    hasOwn: typeof Object.hasOwn === 'function',
    replaceAll: typeof String.prototype.replaceAll === 'function'
  };
  function element(id) { return document.getElementById(id); }
  function report() {
    return JSON.stringify({ version: version, variant: variant, userAgent: navigator.userAgent,
      viewport: [window.innerWidth, window.innerHeight], capabilitiesBeforePolyfills: capabilities,
      native: nativeInfo, completed: completed, failed: failed, events: events }, null, 2);
  }
  function refresh() { if (element('startup-report')) element('startup-report').value = report(); }
  function mark(stage) {
    if (events.length < 40) events.push({ ms: Date.now() - started, stage: stage });
    refresh();
  }
  // Never copy exception messages, arbitrary URLs, storage values or full stacks.
  function describe(error, filename, line, column) {
    var name = error && error.name;
    var allowed = ['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'RangeError', 'SecurityError', 'QuotaExceededError'];
    var type = allowed.indexOf(name) >= 0 ? name : 'Error';
    var location = String(filename || '').split(/[?#]/)[0].match(/(?:^|\/)([A-Za-z0-9_.-]+\.m?js)$/);
    if (!location && error && typeof error.stack === 'string') {
      location = error.stack.match(/\/([A-Za-z0-9_.-]+\.m?js):(\d+):(\d+)/);
      if (location) { line = location[2]; column = location[3]; }
    }
    return type + (location ? ' @ ' + location[1] + ':' + (Number(line) || 0) + ':' + (Number(column) || 0) : '');
  }
  function show() {
    var panel = element('startup-panel');
    if (!panel) return;
    panel.hidden = false;
    element('startup-details').open = true;
    element('startup-retry').hidden = false;
    refresh();
  }
  function close() {
    var panel = element('startup-panel');
    if (!completed || !panel) return false;
    panel.hidden = true;
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.removeAttribute('aria-modal');
    manuallyOpened = false;
    var trigger = returnFocus;
    returnFocus = null;
    if (trigger && document.documentElement.contains(trigger) && !trigger.disabled && typeof trigger.focus === 'function') trigger.focus();
    return true;
  }
  function open(trigger) {
    bind();
    var panel = element('startup-panel');
    if (!panel) return false;
    if (!manuallyOpened) returnFocus = trigger && typeof trigger.focus === 'function' ? trigger : document.activeElement;
    manuallyOpened = true;
    element('startup-title').textContent = '启动诊断';
    element('startup-message').textContent = variant === 'standard'
      ? '正式版本启动诊断。自动热更新按正常规则运行；打开或关闭报告不会修改更新状态。'
      : '测试版本：' + variant + '。自动热更新已暂停。';
    element('startup-copy').textContent = '复制诊断信息';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-live', 'off');
    panel.setAttribute('aria-labelledby', 'startup-title');
    show();
    var focusTarget = completed ? element('startup-close') : element('startup-copy');
    if (focusTarget) focusTarget.focus();
    return true;
  }
  function nativeMetadata(info) {
    if (!info || typeof info !== 'object') return null;
    var result = {};
    // Only the native plugin's documented environment fields enter the report.
    var keys = ['model', 'android', 'sdk', 'variant', 'nativeVersion', 'nativeStages', 'webViewPackage', 'webViewVersion'];
    for (var index = 0; index < keys.length; index += 1) {
      var value = info[keys[index]];
      if (typeof value === 'string' || (typeof value === 'number' && isFinite(value))) result[keys[index]] = value;
    }
    return result;
  }
  function fail(stage, error, filename, line, column) {
    failed = true;
    mark(stage + ': ' + describe(error, filename, line, column));
    if (element('startup-title')) {
      element('startup-title').textContent = '游戏启动未完成';
      element('startup-message').textContent = '请复制诊断信息反馈给作者，然后尝试重新启动。此操作不会删除存档。';
    }
    show();
  }
  var timer = window.setTimeout(function () {
    if (!completed) fail('等待首屏超过 15 秒');
  }, 15000);
  window.__startupDiagnostics = {
    mark: mark, fail: fail, report: report, bind: bind, open: open, close: close,
    native: function (info) { nativeInfo = nativeMetadata(info); refresh(); },
    ready: function () {
      if (completed) return;
      completed = true;
      window.clearTimeout(timer);
      mark('首屏渲染完成');
      if (!failed && !manuallyOpened && element('startup-panel')) element('startup-panel').hidden = true;
      if (element('startup-open')) element('startup-open').hidden = variant === 'standard' && !failed;
      if (element('startup-close')) element('startup-close').hidden = false;
    }
  };
  window.addEventListener('error', function (event) {
    if (completed) return;
    var target = event.target;
    if (target && target !== window) {
      if (target.tagName === 'SCRIPT') fail('主脚本加载失败');
      else if (target.tagName === 'LINK' && target.rel === 'stylesheet') fail('样式加载失败');
      return;
    }
    fail('脚本执行失败', event.error, event.filename, event.lineno, event.colno);
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    if (!completed) fail('启动异步任务失败', event.reason);
  });
  function bind() {
    if (bound || !element('startup-panel')) return;
    bound = true;
    refresh();
    if (failed) fail('页面已显示故障信息');
    element('startup-retry').onclick = function () { window.location.reload(); };
    element('startup-open').onclick = function () { open(element('startup-open')); };
    element('startup-copy').onclick = function () {
      var field = element('startup-report');
      refresh(); field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
      var copied = false;
      try { copied = document.execCommand('copy'); } catch (error) { mark('剪贴板复制失败：' + describe(error)); }
      element('startup-copy').textContent = copied ? '已复制' : '请长按上方文本复制';
    };
    // After successful startup the same button closes the report without reloading.
    var closeButton = document.createElement('button');
    closeButton.id = 'startup-close';
    closeButton.type = 'button';
    closeButton.hidden = !completed;
    closeButton.textContent = '返回游戏';
    closeButton.onclick = close;
    element('startup-panel').appendChild(closeButton);
    element('startup-panel').onkeydown = function (event) {
      if (!manuallyOpened || element('startup-panel').hidden) return;
      if ((event.key === 'Escape' || event.keyCode === 27) && completed) { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' && event.keyCode !== 9) return;
      var candidates = element('startup-panel').querySelectorAll('button, textarea, summary');
      var controls = [];
      for (var index = 0; index < candidates.length; index += 1) {
        if (!candidates[index].hidden && !candidates[index].disabled && candidates[index].getClientRects().length) controls.push(candidates[index]);
      }
      if (!controls.length) return;
      var first = controls[0];
      var last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
  }
  mark('入口 HTML 已加载');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
}());
