import { readFileSync, writeFileSync } from 'node:fs';

const stylesPath = 'android/app/src/main/assets/www/styles.css';
const appPath = 'android/app/src/main/assets/www/app.js';

let styles = readFileSync(stylesPath, 'utf8');
styles += `

/* Test-only fixed five-item bottom dock. */
:root{
  --fixed-dock-height:clamp(60px,8.4dvh,68px);
}
.bottom-nav{
  left:0!important;
  right:0!important;
  bottom:0!important;
  width:100%!important;
  max-width:none!important;
  min-height:var(--fixed-dock-height)!important;
  height:var(--fixed-dock-height);
  transform:none!important;
  border-left:0!important;
  border-right:0!important;
  border-bottom:0!important;
  border-radius:20px 20px 0 0!important;
  box-sizing:border-box;
  grid-template-columns:repeat(5,minmax(0,1fr))!important;
  gap:clamp(1px,.8vw,5px)!important;
  padding-top:6px!important;
  padding-bottom:6px!important;
  padding-left:max(5px,var(--android-safe-left,0px))!important;
  padding-right:max(5px,var(--android-safe-right,0px))!important;
  transition:none!important;
}
.bottom-nav.dock-hidden{
  opacity:1!important;
  transform:none!important;
  pointer-events:auto!important;
}
.bottom-nav .nav-tab{
  min-width:0!important;
  min-height:calc(var(--fixed-dock-height) - 12px)!important;
  padding:3px 2px!important;
  border-radius:clamp(11px,3vw,16px)!important;
}
.bottom-nav .nav-tab span{
  font-size:clamp(14px,4.2vw,18px)!important;
}
.bottom-nav .nav-tab b{
  max-width:100%;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:clamp(8px,2.45vw,10px)!important;
}
.wallet-center-tab,.wallet-center-tab.active{
  width:clamp(48px,14vw,58px)!important;
  height:clamp(48px,14vw,58px)!important;
  min-height:clamp(48px,14vw,58px)!important;
  max-height:58px!important;
  transform:translateY(-6px)!important;
}
.wallet-center-tab .wallet-center-icon{
  width:clamp(21px,6.3vw,25px)!important;
  height:clamp(21px,6.3vw,25px)!important;
}
.main{
  padding-bottom:calc(var(--fixed-dock-height) + 30px + var(--android-safe-bottom,0px))!important;
}
.fab{
  bottom:calc(var(--fixed-dock-height) + 14px + var(--android-safe-bottom,0px))!important;
}
.toast{
  bottom:calc(var(--fixed-dock-height) + 16px + var(--android-safe-bottom,0px))!important;
}
@media(max-width:365px){
  :root{--fixed-dock-height:60px}
  .bottom-nav{border-radius:17px 17px 0 0!important}
  .bottom-nav .nav-tab{padding-inline:1px!important}
  .bottom-nav .nav-tab b{font-size:8px!important}
  .wallet-center-tab,.wallet-center-tab.active{
    width:48px!important;height:48px!important;min-height:48px!important;
  }
}
@media(min-width:700px){
  .bottom-nav{
    padding-left:max(10px,var(--android-safe-left,0px))!important;
    padding-right:max(10px,var(--android-safe-right,0px))!important;
  }
  .bottom-nav .nav-tab b{font-size:10px!important}
}
`;
writeFileSync(stylesPath, styles);

let app = readFileSync(appPath, 'utf8');
const listener = "window.addEventListener('scroll', scheduleDockVisibilityUpdate, { passive:true });";
if (app.includes(listener)) {
  app = app.replace(listener, "document.querySelector('#bottomNav')?.classList.remove('dock-hidden');");
}
writeFileSync(appPath, app);

console.log('Applied fixed responsive five-item bottom dock test overlay.');
