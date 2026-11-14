const ids=[];const track=n=>{ids.push(n.id);return n};
await Promise.all(['Regular','Medium','SemiBold'].map(style=>figma.loadFontAsync({family:'Geist',style})));
const vars=Object.fromEntries((await figma.variables.getLocalVariablesAsync()).map(v=>[v.name,v]));
const styles=Object.fromEntries((await figma.getLocalTextStylesAsync()).map(v=>[v.name,v]));
function paint(n,key,stroke=false){const p=figma.variables.setBoundVariableForPaint({type:'SOLID',color:{r:0,g:0,b:0}},'color',vars['color/'+key]);if(stroke)n.strokes=[p];else n.fills=[p];}
function space(n,gap=16,pad=0){n.setBoundVariable('itemSpacing',vars['space/'+gap]);for(const f of ['paddingLeft','paddingRight','paddingTop','paddingBottom'])n.setBoundVariable(f,vars['space/'+pad]);}
function radius(n,r=12){for(const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(f,vars['radius/'+r]);}
function box(parent,name,w,h,dir='VERTICAL',bg=null,gap=16,pad=0){const n=track(figma.createAutoLayout(dir));n.name=name;if(parent)parent.appendChild(n);n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.counterAxisSizingMode='FIXED';space(n,gap,pad);n.fills=[];if(bg)paint(n,bg);return n;}
async function text(parent,str,style='Body',color='text-primary',width=null){const n=track(figma.createText());parent.appendChild(n);await n.setTextStyleIdAsync(styles['Mirai/'+style].id);n.characters=str;paint(n,color);if(width){n.textAutoResize='HEIGHT';n.resize(width,n.height);}return n;}
function inst(parent,c,name){const n=track(c.createInstance());parent.appendChild(n);if(name)n.name=name;return n;}
function svg(parent,name,path,size=20){const n=track(figma.createNodeFromSvg('<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="'+path+'" stroke="#B0B0B0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'));n.name=name;parent.appendChild(n);return n;}
const icons={chat:'M4 4h16v12H9l-5 4V4Z',dashboard:'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',briefcase:'M4 7h16v13H4z M8 7V4h8v3 M4 12h16',file:'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-3c0-5 16-5 16 0v3',swap:'M4 8h15l-4-4 M20 16H5l4 4',plus:'M12 5v14 M5 12h14',pause:'M9 6v12 M15 6v12',arrow:'M12 19V5 M6 11l6-6 6 6'};
