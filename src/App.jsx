import { useState, useCallback, useEffect, useRef } from "react";
import THEMES from "./themes.js";

// ─── Defaults ─────────────────────────────────────────────────────────────────
// FIX: only copyD:true by default — A/T/O/U require elevated permissions and caused errors
const FACTORY_DEFAULTS = {
  source:"", target:"",
  whatToCopy:"E", levN:"1",
  copyMethod:"COPY",
  includeFolder:true,   // true = append source folder name to dest path
  copyD:true, copyS:false, copyA:false, copyT:false, copyO:false, copyU:false,
  retries:"10", waitTime:"30",
  copyMode:"",   // blank = standard copy, no admin rights needed
  threads:"8", useThreads:false,
  extraParams:"/NP",
  logToFile:false,
};

// Version key — increment this whenever FACTORY_DEFAULTS change to wipe stale saves
const DEFAULTS_VERSION = "v5";
const loadDefaults = () => {
  try {
    const savedVersion = localStorage.getItem("robocopy_defaults_version");
    if (savedVersion !== DEFAULTS_VERSION) {
      // Stale save from old version — discard it and use fresh factory defaults
      localStorage.removeItem("robocopy_defaults");
      localStorage.setItem("robocopy_defaults_version", DEFAULTS_VERSION);
      return FACTORY_DEFAULTS;
    }
    const s = localStorage.getItem("robocopy_defaults");
    return s ? {...FACTORY_DEFAULTS, ...JSON.parse(s)} : FACTORY_DEFAULTS;
  }
  catch { return FACTORY_DEFAULTS; }
};
const loadQueue  = () => { try { const s = localStorage.getItem("robocopy_queue");  return s ? JSON.parse(s) : []; } catch { return []; } };
const loadTheme  = () => { try { return localStorage.getItem("robocopy_theme") || "dark"; } catch { return "dark"; } };

// ─── Command builder ─────────────────────────────────────────────────────────
// buildArgs: returns a plain string[] for spawn() — no quoting needed, paths
//            with spaces are handled safely by Node's argv passing.
function buildArgs(s) {
  const src = s.source || "C:\\Source";
  const baseDst = s.target || "C:\\Target";
  // includeFolder: append the source folder name so robocopy recreates it at dest
  // e.g. source="E:\New folder", target="C:\test" => effective dest="C:\test\New folder"
  let dst = baseDst;
  if (s.includeFolder && s.source) {
    const folderName = s.source.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
    if (folderName) dst = baseDst.replace(/[\\/]+$/, "") + "\\" + folderName;
  }
  const args = [src, dst];
  if (s.whatToCopy === "S") args.push("/S");
  else if (s.whatToCopy === "E") args.push("/E");
  else if (s.whatToCopy === "LEV") args.push("/LEV:" + s.levN);
  if (s.copyMethod === "MOV")        args.push("/MOV");
  else if (s.copyMethod === "MOVE")  args.push("/MOVE");
  else if (s.copyMethod === "PURGE") args.push("/PURGE");
  const flags = [s.copyD&&"D",s.copyS&&"S",s.copyA&&"A",s.copyT&&"T",s.copyO&&"O",s.copyU&&"U"].filter(Boolean).join("");
  if (flags) args.push("/COPY:" + flags);
  if (s.retries)  args.push("/R:" + s.retries);
  if (s.waitTime) args.push("/W:" + s.waitTime);
  if (s.copyMode === "Z")       args.push("/Z");
  else if (s.copyMode === "ZB") args.push("/ZB");
  else if (s.copyMode === "B")  args.push("/B");
  if (s.useThreads && s.threads) args.push("/MT:" + s.threads);
  // Split extra params on whitespace so each flag is its own argv element
  if (s.extraParams.trim()) {
    s.extraParams.trim().split(/\s+/).forEach(p => { if (p) args.push(p); });
  }
  if (s.logToFile) args.push("/LOG:" + dst + "\\robocopy.log");
  return args;
}

// buildCommand: display-only — produces a human-readable preview string.
// Uses straight ASCII double-quotes so it's also safe to paste into cmd.exe.
function buildCommand(s) {
  const args = buildArgs(s);
  // Wrap source and destination (first two args) in straight quotes for display
  const display = args.map((a, i) => (i < 2 ? '"' + a + '"' : a));
  return "robocopy " + display.join(" ");
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@400;500;600;700&display=swap');`;

const BASE_CSS = `
  ${FONTS}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body,#root{height:100%;width:100%;background:var(--app-bg);overflow:hidden;}

  /* ── Root scroll container ── */
  .app{
    width:100%;
    height:100%;
    background:var(--app-bg);
    background-image:
      repeating-linear-gradient(0deg,transparent,transparent 39px,var(--app-grid) 40px),
      repeating-linear-gradient(90deg,transparent,transparent 39px,var(--app-grid) 40px);
    font-family:'Barlow',sans-serif;
    color:var(--app-color);
    display:flex;
    flex-direction:column;
    overflow-y:auto;
    overflow-x:hidden;
    transition:background 0.25s,color 0.25s;
  }

  /* ── Inner wrapper — fills all available space, columns on wide screens ── */
  .app-inner{
    flex:1;
    display:flex;
    flex-direction:column;
    gap:10px;
    padding:12px;
    width:100%;
    min-height:0;
  }

  /* ── Main window — always fills full width ── */
  .window{
    width:100%;
    flex-shrink:0;
    background:var(--win-bg);
    border:1px solid var(--win-border);
    border-radius:4px;
    box-shadow:var(--win-shadow);
    overflow:hidden;
  }

  /* ── Queue and terminal panels fill full width below main ── */
  .queue-panel,.terminal-wrap{
    width:100%;
    flex-shrink:0;
  }
  .titlebar{background:var(--titlebar-bg);border-bottom:1px solid var(--titlebar-border);padding:10px 16px;display:flex;align-items:center;gap:10px;-webkit-app-region:drag;user-select:none;}
  .titlebar-icon{width:18px;height:18px;background:var(--icon-bg);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700;flex-shrink:0;-webkit-app-region:no-drag;}
  .titlebar-text{font-family:'Share Tech Mono',monospace;font-size:clamp(10px,1.5vw,13px);color:var(--titlebar-text);letter-spacing:0.05em;}
  .titlebar-sub{font-size:11px;color:var(--titlebar-sub);margin-left:4px;}
  .titlebar-right{margin-left:auto;display:flex;align-items:center;gap:6px;-webkit-app-region:no-drag;}
  .theme-picker{display:flex;align-items:center;gap:4px;background:var(--theme-picker-bg);border:1px solid var(--theme-picker-border);border-radius:3px;padding:3px 5px;}
  .theme-picker-label{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--sub-label);letter-spacing:0.1em;text-transform:uppercase;margin-right:2px;}
  .theme-btn{background:var(--theme-btn-bg);border:1px solid var(--theme-btn-border);border-radius:2px;color:var(--theme-btn-color);font-family:'Share Tech Mono',monospace;font-size:10px;padding:3px 8px;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
  .theme-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .theme-btn.active{background:var(--theme-btn-active-bg);border-color:var(--theme-btn-active-border);color:var(--theme-btn-active-color);}
  .content{padding:clamp(10px,2vw,18px);display:flex;flex-direction:column;gap:clamp(8px,1.5vw,13px);}
  .field-group{border:1px solid var(--group-border);border-radius:3px;padding:clamp(10px,1.5vw,13px);position:relative;background:var(--group-bg);}
  .group-label{position:absolute;top:-9px;left:10px;background:var(--group-bg);padding:0 6px;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--group-label);font-family:'Share Tech Mono',monospace;}
  .dir-row{display:flex;gap:8px;align-items:center;}
  .dir-input{flex:1;background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;color:var(--input-color);font-family:'Share Tech Mono',monospace;font-size:12px;padding:7px 10px;outline:none;transition:border-color 0.2s;}
  .dir-input:focus{border-color:var(--input-focus);box-shadow:0 0 0 2px var(--input-focus-glow);}
  .dir-input::placeholder{color:var(--input-placeholder);}
  .browse-btn{background:var(--browse-bg);border:1px solid var(--browse-border);border-radius:2px;color:var(--browse-color);font-family:'Share Tech Mono',monospace;font-size:11px;padding:6px 12px;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
  .browse-btn:hover{background:var(--browse-hover-bg);border-color:var(--radio-active);color:var(--radio-hover);}
  .options-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(8px,1.5vw,14px);}  @media(max-width:640px){.options-grid{grid-template-columns:1fr 1fr;}}  @media(max-width:420px){.options-grid{grid-template-columns:1fr;}}
  .sub-group{display:flex;flex-direction:column;gap:7px;}
  .sub-label{font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--sub-label);margin-bottom:2px;font-family:'Share Tech Mono',monospace;display:flex;align-items:center;gap:6px;}
  .radio-item,.check-item{display:flex;align-items:flex-start;gap:8px;cursor:pointer;font-size:12px;color:var(--radio-color);line-height:1.4;transition:color 0.15s;user-select:none;padding:2px 0;}
  .radio-item:hover,.check-item:hover{color:var(--radio-hover);}
  .custom-radio{width:14px;height:14px;border:1px solid var(--radio-border);border-radius:50%;background:var(--radio-bg);flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;}
  .custom-check{width:14px;height:14px;border:1px solid var(--radio-border);border-radius:2px;background:var(--radio-bg);flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;transition:all 0.15s;}
  .radio-item.active .custom-radio{border-color:var(--radio-active);box-shadow:0 0 0 3px var(--radio-glow);}
  .radio-item.active .custom-radio::after{content:'';width:6px;height:6px;background:var(--radio-active);border-radius:50%;display:block;}
  .check-item.active .custom-check{background:var(--check-active-bg);border-color:var(--check-active-bg);}
  .check-item.active .custom-check::after{content:'✓';color:#fff;font-size:10px;line-height:1;}
  .check-item.always-on{opacity:0.5;cursor:default;}
  .num-row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--num-color);}
  .num-input{width:52px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;color:var(--input-color);font-family:'Share Tech Mono',monospace;font-size:12px;padding:5px 8px;outline:none;text-align:right;}
  .num-input:focus{border-color:var(--input-focus);}
  .lev-input{width:40px;background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;color:var(--input-color);font-family:'Share Tech Mono',monospace;font-size:12px;padding:4px 6px;outline:none;text-align:center;}
  .extra-input{width:100%;background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;color:var(--input-color);font-family:'Share Tech Mono',monospace;font-size:12px;padding:7px 10px;outline:none;}
  .extra-input:focus{border-color:var(--input-focus);}
  .divider{border:none;border-top:1px solid var(--divider);margin:4px 0;}
  .mt-badge{background:var(--mt-badge-bg);border:1px solid var(--mt-badge-border);border-radius:2px;color:var(--mt-badge-color);font-family:'Share Tech Mono',monospace;font-size:9px;padding:1px 5px;letter-spacing:0.06em;}
  .cmd-panel{background:var(--cmd-bg);border:1px solid var(--cmd-border);border-radius:3px;padding:12px 14px;font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--cmd-color);word-break:break-all;line-height:1.6;position:relative;cursor:pointer;transition:border-color 0.2s;min-height:48px;}
  .cmd-panel:hover{border-color:var(--radio-active);}
  .cmd-panel::before{content:'> ';color:var(--cmd-prefix);}
  .cmd-copy-hint{position:absolute;top:8px;right:10px;font-size:10px;color:var(--cmd-hint);letter-spacing:0.06em;}
  .action-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
  .run-btn{background:var(--start-bg);border:1px solid var(--start-border);border-radius:3px;color:var(--start-color);font-family:'Barlow',sans-serif;font-size:clamp(11px,1.4vw,13px);font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:clamp(7px,1vw,10px) clamp(14px,2vw,22px);cursor:pointer;transition:all 0.18s;box-shadow:0 2px 12px var(--start-shadow);}
  .run-btn:hover:not(:disabled){background:var(--start-hover-bg);box-shadow:0 4px 20px var(--start-hover-shadow);transform:translateY(-1px);}
  .run-btn:disabled{opacity:0.5;cursor:not-allowed;transform:none;}
  .cancel-btn{background:#3a0a0a;border:1px solid #9a2020;border-radius:3px;color:#e06060;font-family:'Barlow',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:10px 22px;cursor:pointer;transition:all 0.18s;}
  .cancel-btn:hover{background:#5a1010;border-color:#e06060;}
  .queue-btn{background:var(--queue-btn-bg);border:1px solid var(--queue-btn-border);border-radius:3px;color:var(--queue-btn-color);font-family:'Barlow',sans-serif;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:9px 16px;cursor:pointer;transition:all 0.15s;}
  .queue-btn:hover{border-color:var(--queue-btn-color);background:var(--queue-btn-hover-bg);}
  .queue-btn.pulse{animation:pulseBlue 0.5s ease;}
  @keyframes pulseBlue{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 5px var(--radio-glow)}}
  .sec-btn{background:transparent;border:1px solid var(--sec-btn-border);border-radius:3px;color:var(--sec-btn-color);font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:0.06em;padding:9px 14px;cursor:pointer;transition:all 0.15s;}
  .sec-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);background:var(--sec-btn-hover-bg);}
  .log-check{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--log-color);cursor:pointer;margin-left:auto;user-select:none;}
  .log-check:hover{color:var(--radio-hover);}
  .footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--footer-border);padding:clamp(6px,1vw,10px) clamp(10px,1.5vw,18px);background:var(--footer-bg);flex-wrap:wrap;gap:6px;}
  .footer-btns{display:flex;gap:6px;flex-wrap:wrap;}
  .footer-btn{background:var(--footer-btn-bg);border:1px solid var(--footer-btn-border);border-radius:2px;color:var(--footer-btn-color);font-family:'Barlow',sans-serif;font-size:12px;padding:6px 13px;cursor:pointer;transition:all 0.15s;}
  .footer-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);background:var(--footer-btn-hover-bg);}
  .footer-btn.saved{border-color:var(--footer-btn-saved-border);color:var(--footer-btn-saved-color);background:var(--footer-btn-saved-bg);}
  .version-tag{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--version-color);letter-spacing:0.1em;}

  /* ── Terminal output window ── */
  .terminal-wrap{background:var(--term-bg);border:1px solid var(--term-border);border-radius:4px;overflow:hidden;animation:slideDown 0.2s ease;}
  .terminal-titlebar{background:var(--titlebar-bg);border-bottom:1px solid var(--term-border);padding:8px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;}
  .terminal-title{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--term-text);letter-spacing:0.05em;display:flex;align-items:center;gap:8px;}
  .terminal-status{font-size:10px;padding:2px 8px;border-radius:2px;font-family:'Share Tech Mono',monospace;border:1px solid;}
  .terminal-status.running{color:#f0a040;border-color:#f0a040;background:rgba(240,160,64,0.1);}
  .terminal-status.ok{color:#4ac880;border-color:#4ac880;background:rgba(74,200,128,0.1);}
  .terminal-status.err{color:#e06060;border-color:#e06060;background:rgba(224,96,96,0.1);}
  .terminal-body{padding:12px;font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--term-text);height:220px;overflow-y:auto;line-height:1.7;white-space:pre-wrap;word-break:break-all;}
  .terminal-body::-webkit-scrollbar{width:4px;}
  .terminal-body::-webkit-scrollbar-track{background:transparent;}
  .terminal-body::-webkit-scrollbar-thumb{background:var(--term-border);border-radius:2px;}
  .terminal-line-err{color:var(--term-err);}
  .terminal-line-ok{color:#4ac880;}
  .terminal-line-dim{color:#555;font-size:10px;}
  .terminal-actions{padding:8px 14px;border-top:1px solid var(--term-border);display:flex;gap:8px;background:var(--group-bg);}

  .queue-panel{background:var(--queue-panel-bg);border:1px solid var(--queue-panel-border);border-radius:4px;overflow:hidden;box-shadow:var(--win-shadow);animation:slideDown 0.2s ease;}
  @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  .queue-titlebar{background:var(--queue-titlebar-bg);border-bottom:1px solid var(--titlebar-border);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;}
  .queue-title{font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--queue-title-color);letter-spacing:0.05em;display:flex;align-items:center;gap:10px;}
  .queue-badge{background:var(--queue-badge-bg);border:1px solid var(--queue-badge-border);border-radius:10px;color:var(--queue-badge-color);font-size:10px;padding:1px 7px;font-family:'Share Tech Mono',monospace;}
  .queue-content{padding:16px;display:flex;flex-direction:column;gap:10px;max-height:480px;overflow-y:auto;}
  .queue-content::-webkit-scrollbar{width:4px;}
  .queue-content::-webkit-scrollbar-track{background:var(--queue-scroll-track);}
  .queue-content::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  .queue-empty{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--queue-empty-color);text-align:center;padding:32px;}
  .job-card{background:var(--job-card-bg);border:1px solid var(--job-card-border);border-radius:3px;padding:12px;display:flex;flex-direction:column;gap:8px;transition:border-color 0.2s;}
  .job-card:hover{border-color:var(--job-card-hover);}
  .job-card.scheduled{border-left:3px solid #f0a040;}
  .job-header{display:flex;align-items:flex-start;gap:8px;}
  .job-num{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--job-num-color);background:var(--job-num-bg);border:1px solid var(--job-num-border);border-radius:2px;padding:2px 7px;flex-shrink:0;}
  .job-src{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--job-src-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .job-tgt{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--job-tgt-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .job-flags{display:flex;gap:5px;flex-wrap:wrap;}
  .job-flag{background:var(--job-flag-bg);border:1px solid var(--job-flag-border);border-radius:2px;color:var(--job-flag-color);font-family:'Share Tech Mono',monospace;font-size:10px;padding:1px 6px;}
  .job-flag.blue{background:var(--queue-btn-bg);border-color:var(--queue-btn-border);color:var(--queue-btn-color);}
  .job-flag.orange{background:#1a1000;border-color:#3a2800;color:#f0a040;}
  .job-cmd{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--job-cmd-color);word-break:break-all;padding:6px 8px;background:var(--job-cmd-bg);border-radius:2px;border:1px solid var(--job-cmd-border);line-height:1.5;}
  .job-actions{display:flex;gap:5px;flex-wrap:wrap;}
  .job-btn{background:transparent;border:1px solid var(--job-btn-border);border-radius:2px;color:var(--job-btn-color);font-family:'Share Tech Mono',monospace;font-size:10px;padding:4px 10px;cursor:pointer;transition:all 0.12s;letter-spacing:0.04em;}
  .job-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);background:var(--job-btn-hover-bg);}
  .job-btn.danger:hover{border-color:#e06060;color:#e06060;background:rgba(224,96,96,0.08);}
  .job-btn.blue:hover{border-color:var(--queue-btn-color);color:var(--queue-btn-color);background:var(--queue-btn-hover-bg);}
  .job-btn:disabled{opacity:0.25;cursor:default;pointer-events:none;}
  .queue-actions{display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--footer-border);background:var(--footer-bg);flex-wrap:wrap;}
  .q-btn{background:var(--q-act-bg);border:1px solid var(--q-act-border);border-radius:2px;color:var(--q-act-color);font-family:'Barlow',sans-serif;font-size:12px;font-weight:600;padding:7px 14px;cursor:pointer;transition:all 0.15s;}
  .q-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);background:var(--q-act-hover-bg);}
  .q-btn.primary{background:var(--q-act-primary-bg);border-color:var(--q-act-primary-border);color:var(--q-act-primary-color);}
  .q-btn.primary:hover{filter:brightness(1.1);}
  .q-btn.danger{color:#9a4040;border-color:rgba(160,64,64,0.4);}
  .q-btn.danger:hover{border-color:#e06060;color:#e06060;background:rgba(224,96,96,0.08);}
  .modal-overlay{position:fixed;inset:0;background:var(--modal-overlay);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(3px);}
  .modal{background:var(--modal-bg);border:1px solid var(--modal-border);border-radius:4px;padding:24px;width:380px;max-width:90vw;box-shadow:0 24px 64px rgba(0,0,0,0.5);}
  .modal-title{font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--modal-title);margin-bottom:12px;}
  .modal-hint{font-size:11px;color:var(--modal-hint);margin-bottom:14px;line-height:1.5;}
  .modal-label{font-size:10px;color:var(--modal-label);margin-bottom:6px;letter-spacing:0.06em;font-family:'Share Tech Mono',monospace;}
  .modal-input{width:100%;background:var(--modal-input-bg);border:1px solid var(--input-border);border-radius:2px;color:var(--input-color);font-family:'Share Tech Mono',monospace;font-size:12px;padding:8px 10px;outline:none;margin-bottom:18px;}
  .modal-input:focus{border-color:var(--input-focus);}
  .modal-actions{display:flex;gap:8px;justify-content:flex-end;}
  .modal-btn{background:var(--modal-btn-bg);border:1px solid var(--modal-btn-border);border-radius:2px;color:var(--modal-btn-color);font-family:'Barlow',sans-serif;font-size:12px;font-weight:600;padding:7px 16px;cursor:pointer;transition:all 0.15s;}
  .modal-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .modal-btn.primary{background:var(--q-act-primary-bg);border-color:var(--q-act-primary-border);color:var(--q-act-primary-color);}

  /* ── File Browser Modal ─────────────────────────────────────────────────── */
  .fb-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);}
  /* Modal is resizable — width/height driven by inline state, min/max enforced */
  .fb-modal{background:var(--win-bg);border:1px solid var(--win-border);border-radius:4px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.7);position:relative;}
  .fb-titlebar{background:var(--titlebar-bg);border-bottom:1px solid var(--titlebar-border);padding:10px 14px;display:flex;align-items:center;gap:8px;flex-shrink:0;}
  .fb-title{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--titlebar-text);flex:1;}
  .fb-close{background:transparent;border:1px solid var(--sec-btn-border);border-radius:2px;color:var(--sec-btn-color);font-size:12px;padding:3px 10px;cursor:pointer;}
  .fb-close:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .fb-toolbar{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--group-border);background:var(--group-bg);flex-shrink:0;flex-wrap:wrap;}
  .fb-nav-btn{background:var(--footer-btn-bg);border:1px solid var(--footer-btn-border);border-radius:2px;color:var(--footer-btn-color);font-family:'Share Tech Mono',monospace;font-size:12px;padding:4px 10px;cursor:pointer;transition:all 0.12s;}
  .fb-nav-btn:hover:not(:disabled){border-color:var(--radio-active);color:var(--radio-hover);}
  .fb-nav-btn:disabled{opacity:0.3;cursor:default;}
  .fb-path{flex:1;background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;color:var(--input-color);font-family:'Share Tech Mono',monospace;font-size:11px;padding:5px 9px;outline:none;min-width:120px;}
  .fb-path:focus{border-color:var(--input-focus);}
  .fb-sort-btn{background:var(--footer-btn-bg);border:1px solid var(--footer-btn-border);border-radius:2px;color:var(--footer-btn-color);font-family:'Share Tech Mono',monospace;font-size:10px;padding:4px 8px;cursor:pointer;white-space:nowrap;transition:all 0.12s;}
  .fb-sort-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .fb-sort-btn.active{border-color:var(--radio-active);color:var(--radio-active);}
  .fb-body{display:flex;flex:1;overflow:hidden;min-height:0;}
  /* Sidebar — width driven by inline state */
  .fb-sidebar{flex-shrink:0;background:var(--group-bg);overflow-y:auto;padding:8px 0;min-width:120px;max-width:400px;}
  .fb-sidebar::-webkit-scrollbar{width:4px;}
  .fb-sidebar::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  .fb-side-label{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--sub-label);letter-spacing:0.1em;text-transform:uppercase;padding:6px 12px 3px;}
  .fb-side-item{display:flex;align-items:center;gap:7px;padding:5px 10px;cursor:pointer;font-size:12px;color:var(--radio-color);transition:background 0.1s;user-select:none;overflow:hidden;}
  .fb-side-item:hover{background:var(--footer-btn-hover-bg);color:var(--radio-hover);}
  .fb-side-item.active{background:var(--q-act-primary-bg);color:var(--radio-active);}
  /* Draggable divider handle */
  .fb-divider{width:5px;flex-shrink:0;background:var(--group-border);cursor:col-resize;transition:background 0.15s;position:relative;z-index:2;}
  .fb-divider:hover,.fb-divider.dragging{background:var(--radio-active);}
  .fb-divider::after{content:'';position:absolute;inset:-3px 0;} /* wider grab area */
  .fb-list{flex:1;overflow-y:auto;padding:4px 0;}
  .fb-list::-webkit-scrollbar{width:6px;}
  .fb-list::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  /* Column header — 3 columns with padding between them */
  .fb-list-header{display:grid;grid-template-columns:1fr 90px 170px;gap:8px;padding:4px 12px;border-bottom:1px solid var(--group-border);background:var(--group-bg);position:sticky;top:0;z-index:1;}
  .fb-col-hdr{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--sub-label);letter-spacing:0.06em;cursor:pointer;user-select:none;padding:2px 0;}
  .fb-col-hdr:hover{color:var(--radio-hover);}
  .fb-row{display:grid;grid-template-columns:1fr 90px 170px;gap:8px;padding:5px 12px;cursor:pointer;user-select:none;transition:background 0.1s;border-bottom:1px solid transparent;}
  .fb-row:hover{background:var(--footer-btn-hover-bg);}
  .fb-row.selected{background:var(--q-act-primary-bg);border-bottom-color:var(--radio-active);}
  .fb-row.selected:hover{background:var(--q-act-primary-bg);}
  .fb-name{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--radio-color);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;}
  .fb-row.selected .fb-name{color:var(--radio-active);}
  .fb-dir-name{color:var(--input-color);}
  .fb-row.selected .fb-dir-name{color:var(--radio-active);}
  .fb-size{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--num-color);text-align:right;white-space:nowrap;}
  .fb-date{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--num-color);white-space:nowrap;}
  .fb-empty{padding:32px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--queue-empty-color);}
  .fb-footer{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--group-border);background:var(--group-bg);flex-shrink:0;}
  .fb-selection{flex:1;font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--input-color);background:var(--input-bg);border:1px solid var(--input-border);border-radius:2px;padding:5px 9px;outline:none;}
  .fb-selection:focus{border-color:var(--input-focus);}
  .fb-select-btn{background:var(--start-bg);border:1px solid var(--start-border);border-radius:2px;color:var(--start-color);font-family:'Barlow',sans-serif;font-size:12px;font-weight:700;padding:7px 20px;cursor:pointer;white-space:nowrap;}
  .fb-select-btn:hover{filter:brightness(1.1);}
  .fb-select-btn:disabled{opacity:0.4;cursor:default;}
  .fb-cancel-btn{background:var(--footer-btn-bg);border:1px solid var(--footer-btn-border);border-radius:2px;color:var(--footer-btn-color);font-family:'Barlow',sans-serif;font-size:12px;font-weight:600;padding:7px 16px;cursor:pointer;}
  .fb-cancel-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  /* Corner resize handle */
  .fb-resize-handle{position:absolute;bottom:0;right:0;width:16px;height:16px;cursor:nwse-resize;z-index:10;}
  .fb-resize-handle::before{content:'';position:absolute;bottom:3px;right:3px;width:8px;height:8px;border-bottom:2px solid var(--sub-label);border-right:2px solid var(--sub-label);border-radius:0 0 2px 0;opacity:0.6;}
  .fb-resize-handle:hover::before{border-color:var(--radio-active);opacity:1;}

  /* ── Preview pane ────────────────────────────────────────────────────────── */
  .fb-preview{width:100%;height:100%;display:flex;flex-direction:column;background:var(--group-bg);overflow:hidden;}
  .fb-preview-header{padding:8px 12px;border-bottom:1px solid var(--group-border);font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--sub-label);letter-spacing:0.08em;text-transform:uppercase;flex-shrink:0;}
  .fb-preview-body{flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;}
  .fb-preview-body::-webkit-scrollbar{width:4px;}
  .fb-preview-body::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  .fb-preview-img{width:100%;flex:1;min-height:0;object-fit:contain;display:block;border-radius:2px;}
  .fb-preview-text{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--cmd-color);padding:10px 12px;white-space:pre;overflow-x:auto;line-height:1.6;flex:1;}
  .fb-preview-text::-webkit-scrollbar{height:4px;width:4px;}
  .fb-preview-text::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  .fb-preview-info{padding:12px;display:flex;flex-direction:column;gap:8px;}
  .fb-preview-icon{font-size:48px;text-align:center;padding:16px 0 8px;}
  .fb-preview-name{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--input-color);word-break:break-all;text-align:center;padding:0 8px;}
  .fb-preview-meta{display:flex;flex-direction:column;gap:4px;margin-top:8px;border-top:1px solid var(--divider);padding-top:8px;}
  .fb-preview-row{display:flex;justify-content:space-between;font-size:10px;font-family:'Share Tech Mono',monospace;}
  .fb-preview-label{color:var(--sub-label);}
  .fb-preview-value{color:var(--input-color);text-align:right;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .fb-preview-empty{color:var(--queue-empty-color);font-family:'Share Tech Mono',monospace;font-size:11px;text-align:center;padding:32px 16px;}
  .fb-preview-trunc{font-size:9px;color:var(--sub-label);font-family:'Share Tech Mono',monospace;padding:4px 12px;border-top:1px solid var(--divider);text-align:center;flex-shrink:0;}
  .fb-preview-toggle{background:var(--footer-btn-bg);border:1px solid var(--footer-btn-border);border-radius:2px;color:var(--footer-btn-color);font-family:'Share Tech Mono',monospace;font-size:10px;padding:4px 9px;cursor:pointer;white-space:nowrap;transition:all 0.12s;}
  .fb-preview-toggle:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .fb-preview-toggle.active{border-color:var(--radio-active);color:var(--radio-active);background:var(--q-act-primary-bg);}

  /* ── View modes ──────────────────────────────────────────────────────────── */
  .fb-view-btns{display:flex;gap:3px;align-items:center;}
  .fb-view-btn{background:var(--footer-btn-bg);border:1px solid var(--footer-btn-border);border-radius:2px;color:var(--footer-btn-color);font-size:13px;padding:3px 7px;cursor:pointer;transition:all 0.12s;line-height:1;}
  .fb-view-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .fb-view-btn.active{border-color:var(--radio-active);color:var(--radio-active);background:var(--q-act-primary-bg);}
  .fb-thumb-slider{width:72px;accent-color:var(--radio-active);cursor:pointer;vertical-align:middle;}
  /* Thumbnail grid */
  .fb-thumb-grid{display:flex;flex-wrap:wrap;gap:8px;padding:10px;overflow-y:auto;align-content:flex-start;}
  .fb-thumb-grid::-webkit-scrollbar{width:6px;}
  .fb-thumb-grid::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  .fb-thumb-item{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;border-radius:3px;border:2px solid transparent;padding:4px;transition:all 0.12s;user-select:none;}
  .fb-thumb-item:hover{background:var(--footer-btn-hover-bg);border-color:var(--group-border);}
  .fb-thumb-item.selected{background:var(--q-act-primary-bg);border-color:var(--radio-active);}
  .fb-thumb-img{object-fit:cover;border-radius:2px;display:block;background:var(--input-bg);}
  .fb-thumb-icon{display:flex;align-items:center;justify-content:center;background:var(--input-bg);border-radius:2px;flex-shrink:0;}
  .fb-thumb-label{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--radio-color);text-align:center;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;width:100%;}
  .fb-thumb-item.selected .fb-thumb-label{color:var(--radio-active);}
  /* Small tile view */
  .fb-tile-grid{display:flex;flex-direction:column;overflow-y:auto;}
  .fb-tile-grid::-webkit-scrollbar{width:6px;}
  .fb-tile-grid::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  .fb-tile-row{display:flex;align-items:center;gap:8px;padding:4px 12px;cursor:pointer;user-select:none;transition:background 0.1s;border-bottom:1px solid transparent;}
  .fb-tile-row:hover{background:var(--footer-btn-hover-bg);}
  .fb-tile-row.selected{background:var(--q-act-primary-bg);border-bottom-color:var(--radio-active);}
  .fb-tile-thumb{object-fit:cover;border-radius:2px;flex-shrink:0;}
  .fb-tile-info{display:flex;flex-direction:column;min-width:0;}
  .fb-tile-name{font-size:12px;color:var(--radio-color);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
  .fb-tile-row.selected .fb-tile-name{color:var(--radio-active);}
  .fb-tile-meta{font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--num-color);}

  /* ── Theme picker dropdown & modal ──────────────────────────────────────── */
  .tp-bar{display:flex;align-items:center;gap:6px;-webkit-app-region:no-drag;}
  .tp-quick-btn{background:var(--theme-btn-bg);border:1px solid var(--theme-btn-border);border-radius:2px;color:var(--theme-btn-color);font-family:'Share Tech Mono',monospace;font-size:11px;padding:3px 9px;cursor:pointer;transition:all 0.15s;white-space:nowrap;}
  .tp-quick-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .tp-quick-btn.active{background:var(--theme-btn-active-bg);border-color:var(--theme-btn-active-border);color:var(--theme-btn-active-color);}
  .tp-select{background:var(--theme-btn-bg);border:1px solid var(--theme-btn-border);border-radius:2px;color:var(--theme-btn-color);font-family:'Share Tech Mono',monospace;font-size:11px;padding:3px 6px;cursor:pointer;outline:none;max-width:160px;}
  .tp-select:focus{border-color:var(--radio-active);}
  .tp-picker-btn{background:var(--theme-btn-bg);border:1px solid var(--theme-btn-border);border-radius:2px;color:var(--theme-btn-color);font-family:'Share Tech Mono',monospace;font-size:11px;padding:3px 9px;cursor:pointer;transition:all 0.15s;}
  .tp-picker-btn:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  /* Theme picker modal */
  .tp-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:400;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);}
  .tp-modal{width:min(900px,94vw);height:min(620px,88vh);background:var(--win-bg);border:1px solid var(--win-border);border-radius:4px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6);}
  .tp-modal-header{background:var(--titlebar-bg);border-bottom:1px solid var(--titlebar-border);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
  .tp-modal-title{font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--titlebar-text);}
  .tp-modal-close{background:transparent;border:1px solid var(--sec-btn-border);border-radius:2px;color:var(--sec-btn-color);font-size:12px;padding:3px 10px;cursor:pointer;}
  .tp-modal-close:hover{border-color:var(--radio-active);color:var(--radio-hover);}
  .tp-modal-body{display:flex;flex:1;overflow:hidden;min-height:0;}
  /* Theme list sidebar */
  .tp-sidebar{width:210px;flex-shrink:0;border-right:1px solid var(--group-border);overflow-y:auto;background:var(--group-bg);padding:8px 0;}
  .tp-sidebar::-webkit-scrollbar{width:4px;}
  .tp-sidebar::-webkit-scrollbar-thumb{background:var(--queue-scroll-thumb);border-radius:2px;}
  .tp-group-label{font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--sub-label);letter-spacing:0.1em;text-transform:uppercase;padding:8px 14px 4px;}
  .tp-theme-item{display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:pointer;font-size:12px;color:var(--radio-color);transition:background 0.1s;user-select:none;}
  .tp-theme-item:hover{background:var(--footer-btn-hover-bg);color:var(--radio-hover);}
  .tp-theme-item.active{background:var(--q-act-primary-bg);color:var(--radio-active);}
  .tp-theme-icon{font-size:14px;flex-shrink:0;width:20px;text-align:center;}
  /* Preview panel */
  .tp-preview-panel{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}
  .tp-preview-header{padding:10px 16px;border-bottom:1px solid var(--group-border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
  .tp-preview-name{font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--group-label);}
  .tp-preview-area{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px;}
  /* Mini mockup blocks */
  .tp-mock-win{border-radius:3px;overflow:hidden;border:1px solid;font-size:11px;}
  .tp-mock-bar{padding:7px 12px;display:flex;align-items:center;gap:8px;font-family:'Share Tech Mono',monospace;font-size:11px;}
  .tp-mock-icon{width:14px;height:14px;border-radius:2px;display:inline-flex;align-items:center;justify-content:center;font-size:8px;color:#fff;font-weight:700;}
  .tp-mock-body{padding:10px 12px;display:flex;flex-direction:column;gap:6px;}
  .tp-mock-row{display:flex;align-items:center;gap:8px;}
  .tp-mock-label{font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:0.08em;text-transform:uppercase;}
  .tp-mock-input{flex:1;border-radius:2px;border:1px solid;padding:4px 8px;font-family:'Share Tech Mono',monospace;font-size:10px;}
  .tp-mock-btn{border-radius:2px;border:1px solid;padding:4px 10px;font-family:'Barlow',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;cursor:default;}
  .tp-mock-cmd{border-radius:2px;border:1px solid;padding:6px 10px;font-family:'Share Tech Mono',monospace;font-size:9px;}
  .tp-mock-radio{display:flex;align-items:center;gap:5px;font-size:10px;}
  .tp-mock-dot{width:10px;height:10px;border-radius:50%;border:1px solid;display:inline-flex;align-items:center;justify-content:center;}
  .tp-mock-dot.on{} .tp-mock-dot.on::after{content:'';width:4px;height:4px;border-radius:50%;display:block;}
  .tp-apply-row{padding:12px 16px;border-top:1px solid var(--group-border);display:flex;align-items:center;justify-content:space-between;background:var(--group-bg);flex-shrink:0;}
  .tp-apply-note{font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--sub-label);}

`;

// ─── Sub-components ───────────────────────────────────────────────────────────
function RadioItem({ active, onClick, children }) {
  return (
    <div className={`radio-item${active ? " active" : ""}`} onClick={onClick}>
      <span className="custom-radio" />{children}
    </div>
  );
}
function CheckItem({ active, onClick, alwaysOn, children }) {
  return (
    <div className={`check-item${active?" active":""}${alwaysOn?" always-on":""}`}
      onClick={alwaysOn ? undefined : onClick}>
      <span className="custom-check" />{children}
    </div>
  );
}


// ─── FileBrowser component ────────────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes === null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
  if (bytes < 1024*1024*1024) return (bytes/1024/1024).toFixed(1) + " MB";
  return (bytes/1024/1024/1024).toFixed(2) + " GB";
}

function getFileIcon(ext, isDir) {
  if (isDir) return "📁";
  const e = (ext || "").toLowerCase();
  if ([".png",".jpg",".jpeg",".gif",".webp",".bmp",".ico",".svg"].includes(e)) return "🖼️";
  if ([".mp4",".mkv",".avi",".mov",".wmv",".flv",".webm"].includes(e)) return "🎬";
  if ([".mp3",".wav",".flac",".aac",".ogg",".wma"].includes(e)) return "🎵";
  if ([".pdf"].includes(e)) return "📕";
  if ([".zip",".rar",".7z",".tar",".gz"].includes(e)) return "🗜️";
  if ([".exe",".msi",".bat",".cmd",".ps1"].includes(e)) return "⚙️";
  if ([".doc",".docx"].includes(e)) return "📝";
  if ([".xls",".xlsx",".csv"].includes(e)) return "📊";
  if ([".ppt",".pptx"].includes(e)) return "📊";
  if ([".txt",".md",".log",".ini",".cfg",".conf"].includes(e)) return "📄";
  if ([".js",".jsx",".ts",".tsx",".py",".c",".cpp",".cs",".java",".go",".rs"].includes(e)) return "💻";
  if ([".json",".xml",".yaml",".yml",".toml"].includes(e)) return "📋";
  return "📄";
}

function PreviewPane({ selected, currentPath }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected || selected.isDir) {
      setPreview(null);
      return;
    }
    setLoading(true);
    setPreview(null);
    window.electronAPI?.previewFile(selected.fullPath).then(p => {
      setPreview(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selected?.fullPath]);

  const ext = selected ? selected.name.includes(".") ? "." + selected.name.split(".").pop() : "" : "";

  if (!selected) {
    return (
      <div className="fb-preview">
        <div className="fb-preview-header">Preview</div>
        <div className="fb-preview-body">
          <div className="fb-preview-empty">Select a file to preview</div>
        </div>
      </div>
    );
  }

  if (selected.isDir) {
    return (
      <div className="fb-preview">
        <div className="fb-preview-header">Preview</div>
        <div className="fb-preview-body">
          <div className="fb-preview-info">
            <div className="fb-preview-icon">📁</div>
            <div className="fb-preview-name">{selected.name}</div>
            <div className="fb-preview-meta">
              <div className="fb-preview-row">
                <span className="fb-preview-label">Type</span>
                <span className="fb-preview-value">Folder</span>
              </div>
              <div className="fb-preview-row">
                <span className="fb-preview-label">Modified</span>
                <span className="fb-preview-value">{selected.modified || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fb-preview">
      <div className="fb-preview-header">Preview</div>
      <div className="fb-preview-body">
        {loading && (
          <div className="fb-preview-empty" style={{color:"var(--sub-label)"}}>Loading…</div>
        )}

        {!loading && preview?.type === "image" && (
          <>
            <img
              className="fb-preview-img"
              src={`data:${preview.mime};base64,${preview.data}`}
              alt={selected.name}
            />
            <div className="fb-preview-info">
              <div className="fb-preview-name">{selected.name}</div>
              <div className="fb-preview-meta">
                <div className="fb-preview-row">
                  <span className="fb-preview-label">Type</span>
                  <span className="fb-preview-value">{preview.ext.toUpperCase().slice(1)} Image</span>
                </div>
                <div className="fb-preview-row">
                  <span className="fb-preview-label">Size</span>
                  <span className="fb-preview-value">{formatSize(preview.size)}</span>
                </div>
                <div className="fb-preview-row">
                  <span className="fb-preview-label">Modified</span>
                  <span className="fb-preview-value">{selected.modified || "—"}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && preview?.type === "text" && (
          <>
            <div className="fb-preview-info" style={{paddingBottom:0}}>
              <div className="fb-preview-name">{selected.name}</div>
              <div className="fb-preview-meta">
                <div className="fb-preview-row">
                  <span className="fb-preview-label">Size</span>
                  <span className="fb-preview-value">{formatSize(preview.size)}</span>
                </div>
                <div className="fb-preview-row">
                  <span className="fb-preview-label">Lines</span>
                  <span className="fb-preview-value">{preview.lines.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="fb-preview-text">{preview.text}</div>
            {preview.truncated && (
              <div className="fb-preview-trunc">⋯ truncated at 256 KB</div>
            )}
          </>
        )}

        {!loading && (preview?.type === "binary" || preview?.type === "info") && (
          <div className="fb-preview-info">
            <div className="fb-preview-icon">{getFileIcon(ext, false)}</div>
            <div className="fb-preview-name">{selected.name}</div>
            <div className="fb-preview-meta">
              <div className="fb-preview-row">
                <span className="fb-preview-label">Type</span>
                <span className="fb-preview-value">{ext.toUpperCase().slice(1) || "File"}</span>
              </div>
              <div className="fb-preview-row">
                <span className="fb-preview-label">Size</span>
                <span className="fb-preview-value">{formatSize(preview.size)}</span>
              </div>
              <div className="fb-preview-row">
                <span className="fb-preview-label">Modified</span>
                <span className="fb-preview-value">{selected.modified || "—"}</span>
              </div>
            </div>
            {preview.type === "binary" && (
              <div style={{marginTop:8,fontSize:10,color:"var(--sub-label)",fontFamily:"monospace",textAlign:"center"}}>
                Binary file — no text preview available
              </div>
            )}
          </div>
        )}

        {!loading && preview?.type === "error" && (
          <div className="fb-preview-info">
            <div className="fb-preview-icon">⚠️</div>
            <div style={{fontSize:10,color:"var(--term-err)",fontFamily:"monospace",textAlign:"center",padding:"0 8px"}}>
              {preview.message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── ThumbnailGrid component ──────────────────────────────────────────────────
// Renders entries as image thumbnails (for images) or icon tiles (for everything else).
// thumbSize = pixel width/height of each thumbnail cell.
function ThumbnailGrid({ entries, currentPath, selected, onSelect, onNavigate, thumbSize }) {
  const imgExts = new Set([".png",".jpg",".jpeg",".gif",".webp",".bmp",".ico",".svg"]);
  const [thumbCache, setThumbCache] = useState({});  // path -> base64

  // Load image thumbnails on demand
  useEffect(() => {
    const toLoad = entries.filter(e => {
      if (e.isDir) return false;
      const ext = e.name.includes(".") ? "." + e.name.split(".").pop().toLowerCase() : "";
      return imgExts.has(ext);
    });
    toLoad.forEach(e => {
      const full = currentPath.replace(/[/\\]+$/, "") + "\\" + e.name;
      if (thumbCache[full]) return;
      window.electronAPI?.previewFile(full).then(p => {
        if (p?.type === "image") {
          setThumbCache(prev => ({ ...prev, [full]: `data:${p.mime};base64,${p.data}` }));
        }
      }).catch(() => {});
    });
  }, [currentPath, entries]);

  return (
    <div className="fb-thumb-grid" style={{flex:1,minHeight:0}}>
      {entries.map(entry => {
        const full = currentPath.replace(/[/\\]+$/, "") + "\\" + entry.name;
        const ext  = entry.name.includes(".") ? "." + entry.name.split(".").pop().toLowerCase() : "";
        const isSel = selected?.fullPath === full;
        const isImg = imgExts.has(ext);
        const thumb = thumbCache[full];

        return (
          <div key={entry.name}
            className={`fb-thumb-item${isSel ? " selected" : ""}`}
            style={{ width: thumbSize + 16, maxWidth: thumbSize + 16 }}
            onClick={() => onSelect(entry, full)}
            onDoubleClick={() => entry.isDir && onNavigate(full)}>
            {isImg && thumb ? (
              <img className="fb-thumb-img" src={thumb}
                style={{ width: thumbSize, height: thumbSize }}
                alt={entry.name} />
            ) : (
              <div className="fb-thumb-icon"
                style={{ width: thumbSize, height: thumbSize, fontSize: Math.max(24, thumbSize * 0.5) }}>
                {getFileIcon(ext, entry.isDir)}
              </div>
            )}
            <div className="fb-thumb-label" style={{ width: thumbSize }}>{entry.name}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TileList component (compact rows with small thumbnail) ───────────────────
function TileList({ entries, currentPath, selected, onSelect, onNavigate }) {
  const imgExts = new Set([".png",".jpg",".jpeg",".gif",".webp",".bmp",".ico",".svg"]);
  const [thumbCache, setThumbCache] = useState({});
  const TILE = 32;

  useEffect(() => {
    entries.filter(e => {
      const ext = e.name.includes(".") ? "." + e.name.split(".").pop().toLowerCase() : "";
      return !e.isDir && imgExts.has(ext);
    }).forEach(e => {
      const full = currentPath.replace(/[/\\]+$/, "") + "\\" + e.name;
      if (thumbCache[full]) return;
      window.electronAPI?.previewFile(full).then(p => {
        if (p?.type === "image")
          setThumbCache(prev => ({ ...prev, [full]: `data:${p.mime};base64,${p.data}` }));
      }).catch(() => {});
    });
  }, [currentPath, entries]);

  return (
    <div className="fb-tile-grid" style={{flex:1,minHeight:0}}>
      {entries.map(entry => {
        const full  = currentPath.replace(/[/\\]+$/, "") + "\\" + entry.name;
        const ext   = entry.name.includes(".") ? "." + entry.name.split(".").pop().toLowerCase() : "";
        const isSel = selected?.fullPath === full;
        const thumb = thumbCache[full];
        const isImg = imgExts.has(ext);

        return (
          <div key={entry.name}
            className={`fb-tile-row${isSel ? " selected" : ""}`}
            onClick={() => onSelect(entry, full)}
            onDoubleClick={() => entry.isDir && onNavigate(full)}>
            {isImg && thumb
              ? <img className="fb-tile-thumb" src={thumb} style={{width:TILE,height:TILE}} alt="" />
              : <div style={{width:TILE,height:TILE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{getFileIcon(ext,entry.isDir)}</div>
            }
            <div className="fb-tile-info">
              <div className="fb-tile-name">{entry.name}</div>
              <div className="fb-tile-meta">{entry.isDir ? "Folder" : formatSize(entry.size)} {entry.modified ? "· " + entry.modified : ""}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FileBrowser({ onSelect, onCancel, title = "Select Folder or File" }) {
  const [drives, setDrives]           = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [pathInput, setPathInput]     = useState("");
  const [entries, setEntries]         = useState([]);
  const [selected, setSelected]       = useState(null);
  const [selInput, setSelInput]       = useState("");
  const [history, setHistory]         = useState([]);
  const [future, setFuture]           = useState([]);
  const [sortBy, setSortBy]           = useState("name");
  const [sortAsc, setSortAsc]         = useState(true);
  const [error, setError]             = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [viewMode, setViewMode]       = useState("details"); // details | tiles | thumbnails
  const [thumbSize, setThumbSize]     = useState(96);  // thumbnail cell size px (64-256)

  // Pane widths (px)
  const [sidebarW,  setSidebarW]  = useState(200);
  const [previewW,  setPreviewW]  = useState(300);

  // Modal size (px)
  const [modalW, setModalW] = useState(Math.min(1100, window.innerWidth  - 40));
  const [modalH, setModalH] = useState(Math.min(680,  window.innerHeight - 80));

  const listRef  = useRef(null);
  const modalRef = useRef(null);

  // ── Drives + initial navigation ──────────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.listDrives)
      window.electronAPI.listDrives().then(d => setDrives(d));
    if (window.electronAPI?.expandPath)
      window.electronAPI.expandPath('%USERPROFILE%\\Downloads').then(p => navigate(p));
  }, []);

  // ── Directory navigation ─────────────────────────────────────────────────
  const navigate = useCallback(async (p, addHistory = true) => {
    if (!window.electronAPI?.readDir) return;
    const resolved = await window.electronAPI.resolvePath(p);
    const result   = await window.electronAPI.readDir(resolved);
    if (!result.ok) { setError(result.error); return; }
    setError("");
    if (addHistory && currentPath) setHistory(h => [...h, currentPath]);
    if (addHistory) setFuture([]);
    setCurrentPath(resolved);
    setPathInput(resolved);
    setEntries(result.entries);
    setSelected(null);
    setSelInput(resolved);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [currentPath]);

  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    else if (sortBy === "size") cmp = (a.size || 0) - (b.size || 0);
    else if (sortBy === "date") cmp = (a.modified || "").localeCompare(b.modified || "");
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (col) => {
    if (sortBy === col) setSortAsc(a => !a); else { setSortBy(col); setSortAsc(true); }
  };

  const handleRowClick = (entry) => {
    const full = currentPath.replace(/[/\\]+$/, "") + "\\" + entry.name;
    setSelected({ ...entry, fullPath: full });
    setSelInput(full);
  };

  const handleRowDblClick = (entry) => {
    if (entry.isDir) navigate(currentPath.replace(/[/\\]+$/, "") + "\\" + entry.name);
  };

  const goUp = () => {
    const parts = currentPath.replace(/[/\\]+$/, "").split(/[/\\]/);
    if (parts.length <= 1) return;
    parts.pop();
    const up = parts.join("\\");
    navigate(up.endsWith(":") ? up + "\\" : up);
  };

  const goBack = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture(f => [currentPath, ...f]);
    setHistory(h => h.slice(0, -1));
    navigate(prev, false);
  };

  const goForward = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory(h => [...h, currentPath]);
    setFuture(f => f.slice(1));
    navigate(next, false);
  };

  const handleConfirm = () => { const v = selInput.trim(); if (v) onSelect(v); };
  const sortArrow = (col) => sortBy === col ? (sortAsc ? " ▲" : " ▼") : "";

  // ── Draggable divider logic ───────────────────────────────────────────────
  const startDrag = useCallback((e, which) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;

    const startX   = e.clientX;
    const startVal = which === "sidebar" ? sidebarW : previewW;

    const onMove = (ev) => {
      const delta = ev.clientX - startX;
      if (which === "sidebar") {
        setSidebarW(Math.max(120, Math.min(400, startVal + delta)));
      } else {
        setPreviewW(Math.max(160, Math.min(600, startVal - delta)));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setTimeout(() => { isDragging.current = false; }, 50);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarW, previewW]);

  // ── Modal resize logic ────────────────────────────────────────────────────
  // isDragging ref: set true during a drag so the overlay onClick is suppressed
  const isDragging = useRef(false);

  const startResize = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;

    const startX = e.clientX, startY = e.clientY;
    const startW = modalW,    startH = modalH;

    const onMove = (ev) => {
      setModalW(Math.max(600, Math.min(window.innerWidth  - 20, startW + ev.clientX - startX)));
      setModalH(Math.max(400, Math.min(window.innerHeight - 20, startH + ev.clientY - startY)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Keep isDragging true a tick longer so the overlay click handler sees it
      setTimeout(() => { isDragging.current = false; }, 50);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [modalW, modalH]);

  const quickAccess = [
    { label: "Desktop",   path: "%USERPROFILE%\\Desktop" },
    { label: "Downloads", path: "%USERPROFILE%\\Downloads" },
    { label: "Documents", path: "%USERPROFILE%\\Documents" },
    { label: "Pictures",  path: "%USERPROFILE%\\Pictures" },
    { label: "Music",     path: "%USERPROFILE%\\Music" },
    { label: "Videos",    path: "%USERPROFILE%\\Videos" },
  ];

  return (
    <div className="fb-overlay" onClick={() => { if (!isDragging.current) onCancel(); }}>
      <div ref={modalRef} className="fb-modal"
        style={{ width: modalW, height: modalH }}
        onClick={e => e.stopPropagation()}>

        {/* Title bar */}
        <div className="fb-titlebar">
          <span className="fb-title">📁 {title}</span>
          <button className="fb-close" onClick={onCancel}>✕ Close</button>
        </div>

        {/* Toolbar */}
        <div className="fb-toolbar">
          <button className="fb-nav-btn" onClick={goBack}    disabled={!history.length}>◀ Back</button>
          <button className="fb-nav-btn" onClick={goForward} disabled={!future.length}>▶ Fwd</button>
          <button className="fb-nav-btn" onClick={goUp}>▲ Up</button>
          <input className="fb-path" value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") navigate(pathInput); }}
            placeholder="Type a path and press Enter…" spellCheck={false} />
          <span style={{fontSize:10,color:"var(--sub-label)",whiteSpace:"nowrap",fontFamily:"monospace"}}>Sort:</span>
          {["name","size","date"].map(col => (
            <button key={col} className={`fb-sort-btn${sortBy===col?" active":""}`}
              onClick={() => handleSort(col)}>
              {col.charAt(0).toUpperCase()+col.slice(1)}{sortArrow(col)}
            </button>
          ))}
          <button className={`fb-preview-toggle${showPreview?" active":""}`}
            onClick={() => setShowPreview(v => !v)} title="Toggle preview pane">
            👁 Preview
          </button>
          <div style={{borderLeft:"1px solid var(--group-border)",margin:"0 2px",height:20}} />
          <div className="fb-view-btns" title="View mode">
            <button className={`fb-view-btn${viewMode==="details"?" active":""}`}
              onClick={() => setViewMode("details")} title="Details view">☰</button>
            <button className={`fb-view-btn${viewMode==="tiles"?" active":""}`}
              onClick={() => setViewMode("tiles")} title="Tile view">⊞</button>
            <button className={`fb-view-btn${viewMode==="thumbnails"?" active":""}`}
              onClick={() => setViewMode("thumbnails")} title="Thumbnail view">⊟</button>
          </div>
          {viewMode === "thumbnails" && (
            <input type="range" className="fb-thumb-slider"
              min={48} max={256} step={8} value={thumbSize}
              onChange={e => setThumbSize(Number(e.target.value))}
              title={"Thumbnail size: " + thumbSize + "px"} />
          )}
        </div>

        {/* Body */}
        <div className="fb-body">

          {/* Sidebar */}
          <div className="fb-sidebar" style={{ width: sidebarW }}>
            <div className="fb-side-label">Quick Access</div>
            {quickAccess.map(q => (
              <div key={q.path}
                className={`fb-side-item${currentPath.toLowerCase().includes(q.label.toLowerCase())?" active":""}`}
                title={q.label}
                onClick={async () => {
                  const resolved = window.electronAPI?.expandPath
                    ? await window.electronAPI.expandPath(q.path) : q.path;
                  navigate(resolved);
                }}>
                <span style={{flexShrink:0}}>📁</span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.label}</span>
              </div>
            ))}
            <div className="fb-side-label" style={{marginTop:8}}>This PC</div>
            {drives.map(d => (
              <div key={d.name}
                className={`fb-side-item${currentPath.toUpperCase().startsWith(d.name.toUpperCase())?" active":""}`}
                title={d.unc ? d.unc + " (" + d.name + ")" : d.label ? d.label + " (" + d.name + ")" : d.root}
                onClick={() => navigate(d.root)}>
                <span style={{flexShrink:0}}>💾</span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                  {d.label
                    ? d.label + " (" + d.name + ")"
                    : d.unc
                      ? d.unc + " (" + d.name + ")"
                      : d.name + "\\"}
                </span>
              </div>
            ))}
          </div>

          {/* Divider: sidebar | file list */}
          <div className="fb-divider" onMouseDown={e => startDrag(e, "sidebar")} title="Drag to resize sidebar" />

          {/* File list — view mode aware */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            {error && (
              <div style={{padding:"8px 12px",fontSize:11,color:"var(--term-err)",background:"rgba(224,96,96,0.08)",borderBottom:"1px solid rgba(224,96,96,0.3)"}}>
                ⚠ {error}
              </div>
            )}
            {viewMode === "details" && (<>
              <div className="fb-list-header">
                <div className="fb-col-hdr" onClick={() => handleSort("name")}>Name{sortArrow("name")}</div>
                <div className="fb-col-hdr" style={{textAlign:"right"}} onClick={() => handleSort("size")}>Size{sortArrow("size")}</div>
                <div className="fb-col-hdr" onClick={() => handleSort("date")}>Date Modified{sortArrow("date")}</div>
              </div>
              <div className="fb-list" ref={listRef}>
                {sorted.length === 0 && !error && <div className="fb-empty">Empty folder</div>}
                {sorted.map(entry => {
                  const full = currentPath.replace(/[/\\/]+$/, "") + "\\" + entry.name;
                  const isSel = selected?.fullPath === full;
                  const ext   = entry.name.includes(".") ? "." + entry.name.split(".").pop() : "";
                  return (
                    <div key={entry.name}
                      className={`fb-row${isSel?" selected":""}`}
                      onClick={() => handleRowClick(entry)}
                      onDoubleClick={() => handleRowDblClick(entry)}>
                      <div className={`fb-name${entry.isDir?" fb-dir-name":""}`}>
                        <span style={{flexShrink:0}}>{getFileIcon(ext, entry.isDir)}</span>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.name}</span>
                      </div>
                      <div className="fb-size">{formatSize(entry.size)}</div>
                      <div className="fb-date">{entry.modified || ""}</div>
                    </div>
                  );
                })}
              </div>
            </>)}
            {viewMode === "tiles" && (
              <TileList entries={sorted} currentPath={currentPath} selected={selected}
                onSelect={(entry, full) => { setSelected({...entry, fullPath:full}); setSelInput(full); }}
                onNavigate={navigate} />
            )}
            {viewMode === "thumbnails" && (
              <ThumbnailGrid entries={sorted} currentPath={currentPath} selected={selected}
                thumbSize={thumbSize}
                onSelect={(entry, full) => { setSelected({...entry, fullPath:full}); setSelInput(full); }}
                onNavigate={navigate} />
            )}
          </div>

          {/* Divider: file list | preview */}
          {showPreview && (
            <div className="fb-divider" onMouseDown={e => startDrag(e, "preview")} title="Drag to resize preview" />
          )}

          {/* Preview pane */}
          {showPreview && (
            <div style={{width: previewW, flexShrink:0}}>
              <PreviewPane selected={selected} currentPath={currentPath} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="fb-footer">
          <input className="fb-selection" value={selInput}
            onChange={e => setSelInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleConfirm(); }}
            placeholder="Selected path…" spellCheck={false} />
          <button className="fb-select-btn" onClick={handleConfirm} disabled={!selInput.trim()}>Select</button>
          <button className="fb-cancel-btn" onClick={onCancel}>Cancel</button>
        </div>

        {/* Corner resize handle */}
        <div className="fb-resize-handle" onMouseDown={startResize} title="Drag to resize window" />
      </div>
    </div>
  );
}



// ─── ThemePickerModal ─────────────────────────────────────────────────────────
function ThemePickerModal({ currentTheme, onApply, onClose }) {
  const [preview, setPreview] = useState(currentTheme);
  const pv = THEMES[preview]?.vars || THEMES.dark.vars;

  const groups = [
    { label: "Quick Access", keys: Object.entries(THEMES).filter(([,t]) => t.pinned).map(([k]) => k) },
    { label: "VS Code Dark",  keys: ["vscDarkPlus","vscOneDarkPro","vscMonokai","vscDraculaTheme","vscNordTheme","vscSolarizedDark"] },
    { label: "VS Code Light", keys: ["vscGithubLight"] },
    { label: "Accessibility", keys: ["hc"] },
  ];

  // Inline-style preview using raw vars from the theme
  const s = (v) => pv[v] || "transparent";
  const cx = (bg, border, color, extra = {}) => ({
    background: bg, border: `1px solid ${border}`, color, ...extra
  });

  return (
    <div className="tp-modal-overlay" onClick={onClose}>
      <div className="tp-modal" onClick={e => e.stopPropagation()}>
        <div className="tp-modal-header">
          <span className="tp-modal-title">🎨 Theme Picker</span>
          <button className="tp-modal-close" onClick={onClose}>✕ Close</button>
        </div>

        <div className="tp-modal-body">
          {/* Sidebar: theme list */}
          <div className="tp-sidebar">
            {groups.map(g => (
              <div key={g.label}>
                <div className="tp-group-label">{g.label}</div>
                {g.keys.filter(k => THEMES[k]).map(k => (
                  <div key={k}
                    className={`tp-theme-item${preview===k?" active":""}`}
                    onClick={() => setPreview(k)}>
                    <span className="tp-theme-icon">{THEMES[k].icon}</span>
                    <span>{THEMES[k].name}</span>
                    {currentTheme === k && (
                      <span style={{marginLeft:"auto",fontSize:9,opacity:0.6,fontFamily:"monospace"}}>active</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Preview panel */}
          <div className="tp-preview-panel">
            <div className="tp-preview-header">
              <span className="tp-preview-name">{THEMES[preview]?.icon} {THEMES[preview]?.name}</span>
              <span style={{fontSize:10,fontFamily:"monospace",color:s("--sub-label")}}>Live Preview</span>
            </div>

            <div className="tp-preview-area" style={{background: s("--app-bg")}}>

              {/* Mockup window */}
              <div className="tp-mock-win" style={{borderColor: s("--win-border"), background: s("--win-bg")}}>

                {/* Titlebar */}
                <div className="tp-mock-bar" style={{background: s("--titlebar-bg"), borderBottom: `1px solid ${s("--titlebar-border")}`}}>
                  <span className="tp-mock-icon" style={{background: s("--icon-bg")}}>R</span>
                  <span style={{color: s("--titlebar-text"), fontFamily:"'Share Tech Mono',monospace", fontSize:11}}>RoboCopy GUI</span>
                  <span style={{color: s("--titlebar-sub"), fontSize:10, marginLeft:4}}>— Microsoft RoboCopy</span>
                </div>

                <div className="tp-mock-body" style={{background: s("--win-bg")}}>
                  {/* Directory fields */}
                  {["Source Directory","Target Directory"].map(lbl => (
                    <div key={lbl} style={{border:`1px solid ${s("--group-border")}`,borderRadius:3,padding:"8px 10px",background:s("--group-bg"),position:"relative",marginBottom:6}}>
                      <span style={{position:"absolute",top:-8,left:8,background:s("--group-bg"),padding:"0 4px",fontSize:9,fontFamily:"monospace",color:s("--group-label"),letterSpacing:"0.1em",textTransform:"uppercase"}}>{lbl}</span>
                      <div style={{display:"flex",gap:6}}>
                        <input readOnly value="C:\Example\Path"
                          style={{flex:1,background:s("--input-bg"),border:`1px solid ${s("--input-border")}`,borderRadius:2,color:s("--input-color"),fontFamily:"monospace",fontSize:10,padding:"4px 8px",outline:"none"}} />
                        <button style={{background:s("--browse-bg"),border:`1px solid ${s("--browse-border")}`,borderRadius:2,color:s("--browse-color"),fontFamily:"monospace",fontSize:10,padding:"4px 8px",cursor:"default"}}>Browse…</button>
                      </div>
                    </div>
                  ))}

                  {/* Options row */}
                  <div style={{display:"flex",gap:10,marginBottom:6}}>
                    {/* Radio group */}
                    <div style={{flex:1,border:`1px solid ${s("--group-border")}`,borderRadius:3,padding:"8px 10px",background:s("--group-bg")}}>
                      <div style={{fontSize:9,fontFamily:"monospace",color:s("--sub-label"),letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>What to Copy</div>
                      {[{label:"/E  All subdirectories",on:true},{label:"/S  No empty dirs",on:false}].map(r=>(
                        <div key={r.label} style={{display:"flex",alignItems:"center",gap:5,marginBottom:4,fontSize:10,color:s(r.on?"--radio-active":"--radio-color")}}>
                          <span style={{width:10,height:10,borderRadius:"50%",border:`1px solid ${s(r.on?"--radio-active":"--radio-border")}`,background:s("--radio-bg"),display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            {r.on&&<span style={{width:4,height:4,borderRadius:"50%",background:s("--radio-active"),display:"block"}} />}
                          </span>
                          {r.label}
                        </div>
                      ))}
                    </div>
                    {/* Num inputs */}
                    <div style={{flex:1,border:`1px solid ${s("--group-border")}`,borderRadius:3,padding:"8px 10px",background:s("--group-bg")}}>
                      <div style={{fontSize:9,fontFamily:"monospace",color:s("--sub-label"),letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Settings</div>
                      {["/R  Retries","/W  Wait Time"].map(lbl=>(
                        <div key={lbl} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,fontSize:10,color:s("--num-color")}}>
                          <span style={{flex:1}}>{lbl}</span>
                          <input readOnly value="10" style={{width:36,background:s("--input-bg"),border:`1px solid ${s("--input-border")}`,borderRadius:2,color:s("--input-color"),fontFamily:"monospace",fontSize:10,padding:"2px 4px",textAlign:"right",outline:"none"}} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Command preview */}
                  <div style={{background:s("--cmd-bg"),border:`1px solid ${s("--cmd-border")}`,borderRadius:3,padding:"6px 10px",fontFamily:"monospace",fontSize:10,color:s("--cmd-color"),marginBottom:8}}>
                    <span style={{color:s("--cmd-prefix")}}>{">"} </span>
                    robocopy "C:\Source" "C:\Target" /E /R:10 /NP
                  </div>

                  {/* Action buttons */}
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <button style={{background:s("--start-bg"),border:`1px solid ${s("--start-border")}`,borderRadius:3,color:s("--start-color"),fontFamily:"'Barlow',sans-serif",fontSize:11,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",padding:"7px 16px",cursor:"default"}}>
                      ▶ Run (F5)
                    </button>
                    <button style={{background:s("--queue-btn-bg"),border:`1px solid ${s("--queue-btn-border")}`,borderRadius:3,color:s("--queue-btn-color"),fontFamily:"'Barlow',sans-serif",fontSize:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",padding:"6px 12px",cursor:"default"}}>
                      + ADD TO QUEUE
                    </button>
                  </div>

                  {/* Footer */}
                  <div style={{borderTop:`1px solid ${s("--footer-border")}`,padding:"6px 0",marginTop:8,display:"flex",gap:6}}>
                    {["↺ Reset","📋 Copy Command","💾 Save as Default"].map(btn=>(
                      <button key={btn} style={{background:s("--footer-btn-bg"),border:`1px solid ${s("--footer-btn-border")}`,borderRadius:2,color:s("--footer-btn-color"),fontFamily:"'Barlow',sans-serif",fontSize:10,padding:"4px 8px",cursor:"default"}}>
                        {btn}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Apply row */}
            <div className="tp-apply-row">
              <span className="tp-apply-note">
                {currentTheme === preview ? "✓ Currently active" : `Preview: ${THEMES[preview]?.name}`}
              </span>
              <div style={{display:"flex",gap:8}}>
                <button className="tp-modal-close" onClick={onClose}>Cancel</button>
                <button
                  style={{background:s("--start-bg"),border:`1px solid ${s("--start-border")}`,borderRadius:2,color:s("--start-color"),fontFamily:"'Barlow',sans-serif",fontSize:12,fontWeight:700,padding:"7px 20px",cursor:preview===currentTheme?"default":"pointer",opacity:preview===currentTheme?0.5:1}}
                  onClick={() => { onApply(preview); onClose(); }}
                  disabled={preview === currentTheme}>
                  Apply Theme
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme]           = useState(loadTheme);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [s, setS]                   = useState(loadDefaults);
  const [copied, setCopied]         = useState(false);
  const [showCommand, setShowCommand] = useState(true);  // show by default so user can verify before running
  const [queue, setQueue]           = useState(loadQueue);
  const [showQueue, setShowQueue]   = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [queueAdded, setQueueAdded] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [scheduleTime, setScheduleTime]   = useState("");
  const [allCopied, setAllCopied]   = useState(false);

  // Terminal state
  const [showTerminal, setShowTerminal] = useState(false);
  const [termLines, setTermLines]       = useState([]);
  const [running, setRunning]           = useState(false);
  const [lastExitCode, setLastExitCode] = useState(null);
  const termBodyRef = useRef(null);

  const update = useCallback((key, val) => setS(prev => ({ ...prev, [key]: val })), []);
  const toggle = useCallback((key)      => setS(prev => ({ ...prev, [key]: !prev[key] })), []);

  // File browser modal state
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserField, setBrowserField] = useState(null); // "source" | "target"

  const handleBrowse = useCallback((field) => {
    setBrowserField(field);
    setBrowserOpen(true);
  }, []);

  const handleBrowserSelect = useCallback((selectedPath) => {
    if (browserField) update(browserField, selectedPath);
    setBrowserOpen(false);
    setBrowserField(null);
  }, [browserField, update]);

  const handleBrowserCancel = useCallback(() => {
    setBrowserOpen(false);
    setBrowserField(null);
  }, []);

  // Apply theme vars
  useEffect(() => {
    const vars = THEMES[theme]?.vars || THEMES.dark.vars;
    Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
    try { localStorage.setItem("robocopy_theme", theme); } catch {}
  }, [theme]);

  // Persist queue
  useEffect(() => {
    try { localStorage.setItem("robocopy_queue", JSON.stringify(queue)); } catch {}
  }, [queue]);

  // Register output listener once
  useEffect(() => {
    if (!window.electronAPI?.onOutput) return;
    const unsub = window.electronAPI.onOutput((line) => {
      setTermLines(prev => [...prev, line]);
    });
    return unsub;
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (termBodyRef.current) {
      termBodyRef.current.scrollTop = termBodyRef.current.scrollHeight;
    }
  }, [termLines]);

  const handleRunCommand = async (argsOrCmd) => {
    if (!window.electronAPI?.runRobocopy) {
      // Fallback when not in Electron
      const preview = Array.isArray(argsOrCmd)
        ? 'robocopy ' + argsOrCmd.map((a,i)=>i<2?`"${a}"`:a).join(" ")
        : argsOrCmd;
      navigator.clipboard.writeText(preview);
      alert("Not running in Electron — command copied to clipboard instead.");
      return;
    }
    // Accept either a pre-built args array or derive from current state
    const args = Array.isArray(argsOrCmd) ? argsOrCmd : buildArgs(s);
    const preview = "robocopy " + args.map((a,i)=>i<2?`"${a}"`:a).join(" ");
    setTermLines([`> ${preview}`, "─".repeat(60)]);
    setShowTerminal(true);
    setRunning(true);
    setLastExitCode(null);

    const result = await window.electronAPI.runRobocopy(args);
    setRunning(false);
    setLastExitCode(result.code);
    setTermLines(prev => [
      ...prev,
      "─".repeat(60),
      result.success
        ? `✓ Completed — exit code ${result.code} (success)`
        : `✗ Failed — exit code ${result.code}`,
    ]);
  };

  const handleCancelRun = async () => {
    if (window.electronAPI?.cancelRobocopy) {
      await window.electronAPI.cancelRobocopy();
      setTermLines(prev => [...prev, "⚠ Job cancelled by user."]);
      setRunning(false);
    }
  };

  const handleCopyCmd = (cmd) => {
    navigator.clipboard.writeText(cmd || buildCommand(s)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveDefaults = () => {
    try { localStorage.setItem("robocopy_defaults", JSON.stringify({ ...s, source:"", target:"" })); } catch {}
    setDefaultSaved(true); setTimeout(() => setDefaultSaved(false), 2500);
  };

  const handleAddToQueue = () => {
    if (!s.source || !s.target) return;
    setQueue(prev => [...prev, { id:Date.now(), ...s, label:`Job ${prev.length+1}`, scheduledTime:"", status:"queued" }]);
    setQueueAdded(true); setTimeout(() => setQueueAdded(false), 2000);
    setShowQueue(true);
  };

  const handleRemoveJob  = (id) => setQueue(prev => prev.filter(j => j.id !== id));
  const handleMoveJob    = (id, dir) => setQueue(prev => {
    const idx = prev.findIndex(j => j.id === id);
    const next = [...prev]; const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return prev;
    [next[idx], next[swap]] = [next[swap], next[idx]]; return next;
  });
  const handleLoadJob    = (job) => { const { id, label, scheduledTime, status, ...rest } = job; setS(rest); setShowQueue(false); };
  const handleSchedule   = (id) => { setScheduleModal(id); setScheduleTime(queue.find(j=>j.id===id)?.scheduledTime||""); };
  const handleScheduleSave = () => {
    setQueue(prev => prev.map(j => j.id===scheduleModal ? {...j, scheduledTime:scheduleTime, status:scheduleTime?"scheduled":"queued"} : j));
    setScheduleModal(null);
  };
  const handleCopyAll = () => {
    navigator.clipboard.writeText(queue.map(j => buildCommand(j)).join("\n")).then(() => {
      setAllCopied(true); setTimeout(() => setAllCopied(false), 2000);
    });
  };
  const handleRunQueue = async () => {
    for (const job of queue) {
      await handleRunCommand(buildArgs(job));
    }
  };
  const handleExportBatch = () => {
    let bat = "@echo off\necho RoboCopy Batch Script - Generated by RoboCopy GUI v2.0\necho.\n\n";
    queue.forEach((job, i) => {
      bat += `echo [${i+1}/${queue.length}] ${job.label||"Job "+(i+1)}\n`;
      if (job.scheduledTime) {
        const [dp, tp] = job.scheduledTime.split("T");
        bat += `schtasks /create /tn "RoboCopy_Job_${i+1}" /tr "${buildCommand(job)}" /sc once /st ${tp?.substring(0,5)||"00:00"}${dp?" /sd "+dp.replace(/-/g,"/"):""} /f\n`;
      } else {
        bat += buildCommand(job) + "\n";
      }
      bat += "\n";
    });
    bat += "echo All jobs complete.\npause\n";
    const url = URL.createObjectURL(new Blob([bat], {type:"text/plain"}));
    Object.assign(document.createElement("a"), {href:url, download:"robocopy_batch.bat"}).click();
    URL.revokeObjectURL(url);
  };

  const cmd = buildCommand(s);
  const canRun = !!s.source && !!s.target;

  const termStatus = running ? "running"
    : lastExitCode === null ? null
    : lastExitCode <= 7 ? "ok" : "err";

  const copyMethodOpts = [
    { val:"COPY",  label:"Copy files  (keep source intact)" },
    { val:"MOV",   label:"/MOV  — Delete source files after copy" },
    { val:"MOVE",  label:"/MOVE  — Delete source files & dirs" },
    { val:"PURGE", label:"/PURGE  — Delete extras at destination" },
  ];

  return (
    <>
      <style>{BASE_CSS}</style>
      <div className="app">
        <div className="app-inner">

        {/* ── Main window ── */}
        <div className="window">
          <div className="titlebar">
            <div className="titlebar-icon">R</div>
            <div>
              <span className="titlebar-text">RoboCopy GUI</span>
              <span className="titlebar-sub">— Graphical Interface for Microsoft RoboCopy</span>
            </div>
            <div className="titlebar-right">
              <div className="tp-bar">
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:"var(--sub-label)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Theme</span>
                {/* Quick-access pinned themes (Dark + Light) */}
                {Object.entries(THEMES).filter(([,t]) => t.pinned).map(([key, t]) => (
                  <button key={key} className={`tp-quick-btn${theme===key?" active":""}`}
                    onClick={() => setTheme(key)} title={t.name}>
                    {t.icon} {t.name}
                  </button>
                ))}
                {/* Dropdown for all themes */}
                <select className="tp-select" value={theme}
                  onChange={e => setTheme(e.target.value)}
                  title="All themes">
                  {Object.entries(THEMES).map(([key, t]) => (
                    <option key={key} value={key}>{t.icon} {t.name}</option>
                  ))}
                </select>
                {/* Open theme picker modal */}
                <button className="tp-picker-btn" onClick={() => setShowThemePicker(true)}
                  title="Open theme picker with preview">
                  🎨 Edit…
                </button>
              </div>
            </div>
          </div>

          <div className="content">
            {/* Source */}
            <div className="field-group">
              <span className="group-label">Source Directory</span>
              <div className="dir-row">
                <input className="dir-input" value={s.source} onChange={e => update("source",e.target.value)} placeholder="C:\SourceFolder\" spellCheck={false} />
                <button className="browse-btn" onClick={() => handleBrowse("source")}>Browse…</button>
              </div>
            </div>

            {/* Target */}
            <div className="field-group">
              <span className="group-label">Target Directory</span>
              <div className="dir-row">
                <input className="dir-input" value={s.target} onChange={e => update("target",e.target.value)} placeholder="C:\TargetFolder" spellCheck={false} />
                <button className="browse-btn" onClick={() => handleBrowse("target")}>Browse…</button>
              </div>
            </div>

            {/* Options */}
            <div className="field-group" style={{padding:"14px"}}>
              <span className="group-label">Copy Options</span>
              <div className="options-grid">

                {/* Col 1 */}
                <div className="sub-group">
                  <div className="sub-label">What to Copy</div>
                  <RadioItem active={s.whatToCopy==="S"} onClick={() => update("whatToCopy", s.whatToCopy==="S"?"":"S")}>/S  Subdirectories (no empty)</RadioItem>
                  <RadioItem active={s.whatToCopy==="E"} onClick={() => update("whatToCopy", s.whatToCopy==="E"?"":"E")}>/E  All subdirectories (incl. empty)</RadioItem>
                  <RadioItem active={s.whatToCopy==="LEV"} onClick={() => update("whatToCopy", s.whatToCopy==="LEV"?"":"LEV")}>
                    <span style={{display:"flex",alignItems:"center",gap:6}}>
                      /LEV:n  Top n levels only
                      <input className="lev-input" value={s.levN} onChange={e => update("levN",e.target.value)}
                        onClick={e => { e.stopPropagation(); update("whatToCopy","LEV"); }} />
                    </span>
                  </RadioItem>
                  <hr className="divider" style={{marginTop:6}} />
                  <div className="sub-label" style={{marginTop:2}}>Copy Scope</div>
                  <RadioItem active={s.includeFolder===true}
                    onClick={() => update("includeFolder", true)}>
                    <span>
                      <span style={{display:"block"}}>Folder + contents</span>
                      <span style={{fontSize:10,color:"var(--sub-label)"}}>Recreates source folder at destination</span>
                    </span>
                  </RadioItem>
                  <RadioItem active={s.includeFolder===false}
                    onClick={() => update("includeFolder", false)}>
                    <span>
                      <span style={{display:"block"}}>Contents only</span>
                      <span style={{fontSize:10,color:"var(--sub-label)"}}>Copies files directly into target folder</span>
                    </span>
                  </RadioItem>
                  <hr className="divider" style={{marginTop:6}} />
                  <div className="sub-label" style={{marginTop:2}}>Copy Method</div>
                  {copyMethodOpts.map(opt => (
                    <RadioItem key={opt.val} active={s.copyMethod===opt.val}
                      onClick={() => update("copyMethod", s.copyMethod===opt.val?"":opt.val)}>
                      {opt.label}
                    </RadioItem>
                  ))}
                </div>

                {/* Col 2 */}
                <div className="sub-group">
                  <div className="sub-label">/COPY — File Info</div>
                  <CheckItem active={s.copyD} alwaysOn>D — file Data (required)</CheckItem>
                  <CheckItem active={s.copyS} onClick={() => toggle("copyS")}>S — Security (NTFS ACLs) *</CheckItem>
                  <CheckItem active={s.copyA} onClick={() => toggle("copyA")}>A — Attributes *</CheckItem>
                  <CheckItem active={s.copyT} onClick={() => toggle("copyT")}>T — Timestamps *</CheckItem>
                  <CheckItem active={s.copyO} onClick={() => toggle("copyO")}>O — Ownership *</CheckItem>
                  <CheckItem active={s.copyU} onClick={() => toggle("copyU")}>U — aUditing info *</CheckItem>
                  <div style={{fontSize:10,color:"var(--sub-label)",marginTop:4,lineHeight:1.4}}>
                    * May require admin rights
                  </div>
                </div>

                {/* Col 3 */}
                <div className="sub-group">
                  <div className="sub-label">Additional Settings</div>
                  <div className="num-row"><span>/R  Retries</span>
                    <input className="num-input" value={s.retries} onChange={e => update("retries",e.target.value)} />
                  </div>
                  <div className="num-row"><span>/W  Wait Time (s)</span>
                    <input className="num-input" value={s.waitTime} onChange={e => update("waitTime",e.target.value)} />
                  </div>
                  <hr className="divider" style={{marginTop:6}} />
                  <div className="sub-label" style={{marginTop:2}}>Copy Mode</div>
                  <RadioItem active={s.copyMode==="Z"}  onClick={() => update("copyMode", s.copyMode==="Z" ?"":"Z")} >
                    /Z  Restart mode
                  </RadioItem>
                  <RadioItem active={s.copyMode==="ZB"} onClick={() => update("copyMode", s.copyMode==="ZB"?"":"ZB")}>
                    /ZB  Restart + Backup fallback
                  </RadioItem>
                  <RadioItem active={s.copyMode==="B"}  onClick={() => update("copyMode", s.copyMode==="B" ?"":"B")} >
                    /B  Backup mode
                  </RadioItem>
                  {(s.copyMode==="Z"||s.copyMode==="ZB"||s.copyMode==="B") && (
                    <div style={{fontSize:10,lineHeight:1.4,padding:"5px 7px",borderRadius:2,background:"rgba(240,160,64,0.12)",border:"1px solid rgba(240,160,64,0.35)",color:"#f0a040",marginTop:2}}>
                      ⚠ Requires <strong>Backup &amp; Restore</strong> user rights (admin). Deselect if you see a rights error.
                    </div>
                  )}
                  <hr className="divider" style={{marginTop:6}} />
                  <div className="sub-label" style={{marginTop:2}}>Multi-Threaded <span className="mt-badge">/MT</span></div>
                  <CheckItem active={s.useThreads} onClick={() => toggle("useThreads")}>Enable multi-thread copy</CheckItem>
                  {s.useThreads && (
                    <div className="num-row" style={{marginTop:2}}>
                      <span>/MT Threads</span>
                      <input className="num-input" style={{width:44}} value={s.threads}
                        onChange={e => update("threads",e.target.value)} min={1} max={128} />
                      <span style={{fontSize:10,color:"var(--sub-label)"}}>(1–128)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Extra params */}
            <div className="field-group">
              <span className="group-label">Append Other Parameters</span>
              <input className="extra-input" value={s.extraParams} onChange={e => update("extraParams",e.target.value)} placeholder="/NP /XO /XN" spellCheck={false} />
            </div>

            {/* Command preview */}
            {showCommand && (
              <div className="cmd-panel" onClick={() => handleCopyCmd()} title="Click to copy">
                <span className="cmd-copy-hint">{copied?"✓ COPIED":"CLICK TO COPY"}</span>
                {cmd}
              </div>
            )}

            {/* Actions */}
            <div className="action-row">
              {!running ? (
                <button className="run-btn" disabled={!canRun}
                  title={canRun ? "Run robocopy now" : "Set Source and Target first"}
                  onClick={() => handleRunCommand(buildArgs(s))}>
                  ▶ Run (F5)
                </button>
              ) : (
                <button className="cancel-btn" onClick={handleCancelRun}>■ Cancel</button>
              )}
              <button className={`queue-btn${queueAdded?" pulse":""}`} onClick={handleAddToQueue}
                style={!canRun?{opacity:0.45,cursor:"not-allowed"}:{}}>
                {queueAdded?"✓ QUEUED":"+ ADD TO QUEUE"}
              </button>
              <button className="sec-btn" onClick={() => setShowCommand(v=>!v)}>
                {showCommand?"HIDE CMD":"SHOW CMD"}
              </button>
              <div className={`check-item log-check${s.logToFile?" active":""}`} onClick={() => toggle("logToFile")}>
                <span className="custom-check" />
                <span style={{fontSize:12,color:"var(--log-color)"}}>Log to file</span>
              </div>
            </div>
          </div>

          <div className="footer">
            <div className="footer-btns">
              <button className="footer-btn" onClick={() => setS(loadDefaults())}>↺ Reset</button>
              <button className="footer-btn" onClick={() => handleCopyCmd()}>📋 Copy Command</button>
              <button className={`footer-btn${defaultSaved?" saved":""}`} onClick={handleSaveDefaults}>
                {defaultSaved?"✓ Saved!":"💾 Save as Default"}
              </button>
              <button className="footer-btn"
                style={showQueue?{borderColor:"var(--queue-btn-color)",color:"var(--queue-btn-color)"}:{}}
                onClick={() => setShowQueue(v=>!v)}>
                ⬡ Batch Queue {queue.length>0&&`(${queue.length})`}
              </button>
              <button className="footer-btn"
                style={showTerminal?{borderColor:"var(--term-text)",color:"var(--term-text)"}:{}}
                onClick={() => setShowTerminal(v=>!v)}>
                ⬛ Output {termStatus==="running"?"(running…)":termStatus==="err"?"(error)":termStatus==="ok"?"(done)":""}
              </button>
            </div>
            <span className="version-tag">ROBOCOPY GUI v2.0</span>
          </div>
        </div>

        {/* ── Terminal output panel ── */}
        {showTerminal && (
          <div className="terminal-wrap">
            <div className="terminal-titlebar">
              <div className="terminal-title">
                ⬛ Output Window
                {termStatus && (
                  <span className={`terminal-status ${termStatus}`}>
                    {termStatus==="running"?"● RUNNING":termStatus==="ok"?`✓ EXIT ${lastExitCode}`:`✗ EXIT ${lastExitCode}`}
                  </span>
                )}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button className="sec-btn" style={{padding:"3px 10px",fontSize:10}}
                  onClick={() => setTermLines([])}>Clear</button>
                <button className="sec-btn" style={{padding:"3px 10px",fontSize:10}}
                  onClick={() => setShowTerminal(false)}>✕</button>
              </div>
            </div>
            <div className="terminal-body" ref={termBodyRef}>
              {termLines.length === 0
                ? <span className="terminal-line-dim">No output yet. Click "Run Copy" to start.</span>
                : termLines.map((line, i) => {
                    const cls = line.startsWith("✓") ? "terminal-line-ok"
                      : line.startsWith("✗") || line.startsWith("STDERR") || line.startsWith("ERROR") ? "terminal-line-err"
                      : line.startsWith("─") || line.startsWith(">") ? "terminal-line-dim"
                      : "";
                    return <div key={i} className={cls}>{line}</div>;
                  })
              }
            </div>
          </div>
        )}

        {/* ── Queue panel ── */}
        {showQueue && (
          <div className="queue-panel">
            <div className="queue-titlebar">
              <div className="queue-title">
                ⬡ Batch Job Queue
                <span className="queue-badge">{queue.length} job{queue.length!==1?"s":""}</span>
              </div>
              <button className="sec-btn" style={{padding:"4px 10px",fontSize:11}} onClick={() => setShowQueue(false)}>✕ Close</button>
            </div>
            <div className="queue-content">
              {queue.length===0 ? (
                <div className="queue-empty">No jobs queued. Configure settings and click "+ ADD TO QUEUE".</div>
              ) : queue.map((job, idx) => {
                const jobCmd = buildCommand(job);
                const flags = [];
                if (job.whatToCopy==="S") flags.push("/S");
                else if (job.whatToCopy==="E") flags.push("/E");
                else if (job.whatToCopy==="LEV") flags.push(`/LEV:${job.levN}`);
                if (job.copyMethod && job.copyMethod!=="COPY") flags.push(`/${job.copyMethod}`);
                else flags.push("COPY");
                if (job.copyMode) flags.push(`/${job.copyMode}`);
                if (job.useThreads) flags.push(`/MT:${job.threads}`);
                const cf = [job.copyD&&"D",job.copyS&&"S",job.copyA&&"A",job.copyT&&"T",job.copyO&&"O",job.copyU&&"U"].filter(Boolean);
                if (cf.length>1||(cf.length===1&&cf[0]!=="D")) flags.push(`/COPY:${cf.join("")}`);
                if (job.logToFile) flags.push("LOG");
                return (
                  <div key={job.id} className={`job-card${job.scheduledTime?" scheduled":""}`}>
                    <div className="job-header">
                      <span className="job-num">#{idx+1}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div className="job-src">📁 {job.source}</div>
                        <div style={{display:"flex",alignItems:"center",gap:4,marginTop:3}}>
                          <span style={{color:"var(--job-arr-color)",fontSize:11}}>→</span>
                          <span className="job-tgt">{job.target}</span>
                        </div>
                      </div>
                    </div>
                    <div className="job-flags">
                      {flags.map(f => <span key={f} className={`job-flag${f.startsWith("/MT")?" blue":f==="LOG"?" orange":""}`}>{f}</span>)}
                      {job.scheduledTime && <span className="job-flag orange">🕐 {job.scheduledTime.replace("T"," ")}</span>}
                    </div>
                    <div className="job-cmd">{jobCmd}</div>
                    <div className="job-actions">
                      <button className="job-btn" onClick={() => handleLoadJob(job)}>✎ Load</button>
                      <button className="job-btn" onClick={() => handleRunCommand(buildArgs(job))} disabled={running}>▶ Run</button>
                      <button className="job-btn blue" onClick={() => handleSchedule(job.id)}>🕐 Schedule</button>
                      <button className="job-btn" onClick={() => handleMoveJob(job.id,-1)} disabled={idx===0}>▲</button>
                      <button className="job-btn" onClick={() => handleMoveJob(job.id,1)} disabled={idx===queue.length-1}>▼</button>
                      <button className="job-btn" onClick={() => navigator.clipboard.writeText(jobCmd)}>📋</button>
                      <button className="job-btn danger" onClick={() => handleRemoveJob(job.id)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {queue.length>0 && (
              <div className="queue-actions">
                <button className="q-btn primary" onClick={handleRunQueue} disabled={running}>
                  {running?"● Running…":"▶ Run All Jobs"}
                </button>
                <button className="q-btn primary" onClick={handleCopyAll}>{allCopied?"✓ COPIED":"📋 Copy All"}</button>
                <button className="q-btn" onClick={handleExportBatch}>💾 Export .bat</button>
                <button className="q-btn danger" onClick={() => { if(window.confirm("Clear all jobs?")) setQueue([]); }}>✕ Clear</button>
              </div>
            )}
          </div>
        )}

        </div>{/* end app-inner */}
      </div>

      {/* ── Theme Picker Modal ── */}
      {showThemePicker && (
        <ThemePickerModal
          currentTheme={theme}
          onApply={setTheme}
          onClose={() => setShowThemePicker(false)}
        />
      )}

      {/* ── File Browser Modal ── */}
      {browserOpen && (
        <FileBrowser
          title={browserField === "source" ? "Select Source Folder or File" : "Select Target Folder"}
          onSelect={handleBrowserSelect}
          onCancel={handleBrowserCancel}
        />
      )}

      {/* ── Schedule modal ── */}
      {scheduleModal!==null && (
        <div className="modal-overlay" onClick={() => setScheduleModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🕐 Schedule Job #{queue.findIndex(j=>j.id===scheduleModal)+1}</div>
            <div className="modal-hint">Set a date/time. Exported .bat will use <code style={{color:"var(--cmd-color)",fontFamily:"monospace",fontSize:11}}>schtasks</code> to register in Windows Task Scheduler.</div>
            <div className="modal-label">SCHEDULED DATE &amp; TIME</div>
            <input type="datetime-local" className="modal-input" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
            <div className="modal-actions">
              <button className="modal-btn" onClick={() => { setScheduleTime(""); handleScheduleSave(); }}>Clear</button>
              <button className="modal-btn" onClick={() => setScheduleModal(null)}>Cancel</button>
              <button className="modal-btn primary" onClick={handleScheduleSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
