// Untitled Fishing 1.6 Part 3 - consumable baits and Bait Boxes.
// Every type has an equal 5% roll for each of the five baits in a box.
const BAIT_BOX_PRICE = 100;
const BAIT_TYPES = [
  {name:"Worm", description:"+10 Luck, -5 Haste."},
  {name:"Insect", description:"+5 Luck and +5 Haste."},
  {name:"Grub", description:"+30 Luck, -10 Steadiness."},
  {name:"Parasite", description:"Half your effective Luck; +30 Haste and +30 Steadiness."},
  {name:"Algae", description:"Only non-item fish can bite."},
  {name:"Salted Seaweed", description:"+10 Luck, +10 Haste, +10 Steadiness."},
  {name:"Egg", description:"+10% fish weight."},
  {name:"Tofu", description:"20% greater natural mutation probabilities (relative increase)."},
  {name:"Vitamins", description:"Guaranteed Nutritious Mutation (1.75x value)."},
  {name:"Larva", description:"0.2% Secret rate per eligible Secret fish (does not reduce Fishy Rod's rate)."},
  {name:"Giant Beetle", description:"Shakes remain for 0.3 seconds longer."},
  {name:"Moth", description:"Shakes spawn 10% faster."},
  {name:"Magnet", description:"Only item catches can bite."},
  {name:"Suspicious Bait", description:"??? (Unknown bait effect)"},
  {name:"Mushrooms", description:"Only fish exclusive to Spring, Autumn, or both."},
  {name:"Brine", description:"25% Dissolved Mutation; independently, 25% instant catch."},
  {name:"Fish Head", description:"+20 Haste; eligible shark-type fish are 1.3x more likely."},
  {name:"Shark Head", description:"+30 Steadiness; 1% Shark Migration trigger after a successful catch."},
  {name:"Skeleton", description:"-20 Luck."},
  {name:"Coal", description:"No effect... yet."}
];
window.createBaits = function(api) {
  const names = new Set(BAIT_TYPES.map(b => b.name));
  function sync() {
    const s=api.state();
    if(!s.baits || typeof s.baits!=="object" || Array.isArray(s.baits))s.baits={};
    if(!names.has(s.equippedBait) || !(s.baits[s.equippedBait]>0))s.equippedBait="";
    return s;
  }
  function add(name,count=1) {
    const s=sync();
    if(!names.has(name) || !Number.isFinite(count) || count<=0)return false;
    s.baits[name]=(s.baits[name]||0)+Math.floor(count);
    return true;
  }
  function migrateOldQuestBait() {
    const s=sync();
    let converted=0;
    for(const [key,item] of Object.entries(s.inventory||{})){
      if(item?.displayName==="Brine Bait" && item.count>0){
        converted+=item.count;
        delete s.inventory[key];
      }
    }
    if(converted)add("Brine",converted);
    return converted;
  }
  function selected() {
    const s=sync();
    return s.equippedBait||null;
  }
  function prepare() {
    const name=selected();
    if(!name)return null;
    const candidates=BAIT_TYPES.filter(x=>x.name!=="Suspicious Bait");
    const effect=name==="Suspicious Bait"?candidates[Math.floor(Math.random()*candidates.length)].name:name;
    return {name,effect};
  }
  function consume(prepared) {
    if(!prepared)return null;
    const s=sync();
    if(!(s.baits[prepared.name]>0))return null;
    s.baits[prepared.name]--;
    if(!s.baits[prepared.name])delete s.baits[prepared.name];
    if(s.equippedBait===prepared.name && !(s.baits[prepared.name]>0))s.equippedBait="";
    if(api.save)api.save(); // Save the consumed bait immediately, even if the game is reloaded mid-hook.
    return prepared;
  }
  function equip(name) {
    const s=sync();
    if(name && (!names.has(name)||!(s.baits[name]>0)))return;
    s.equippedBait=name||"";
    api.log(name?`Equipped ${name}. One bait will be used per hooked fish.`:"Unequipped bait.");
    api.render();
  }
  function openBox(source="Bait Box"){
    const rolled=[];
    for(let i=0;i<5;i++){
      const name=BAIT_TYPES[Math.floor(Math.random()*BAIT_TYPES.length)].name;
      add(name,1);rolled.push(name);
    }
    api.log(`${source} opened: ${rolled.join(", ")}.`,"success");
    return rolled;
  }
  function buyBox() {
    const s=sync();
    if(s.money<BAIT_BOX_PRICE){api.log("Not enough Gold for a Bait Box.","warning");return;}
    s.money-=BAIT_BOX_PRICE;
    openBox("Purchased Bait Box");
    api.render();
  }
  function render() {
    const s=sync(),name=selected();
    const summary=document.getElementById("equippedBaitSummary");
    if(summary)summary.textContent=name?`Equipped: ${name} · ${s.baits[name]} remaining · 1 used per hook`:"Equipped: None · Buy or catch Bait Boxes for 5 random baits";
    const buy=document.getElementById("buyBaitBoxBtn");
    if(buy)buy.disabled=s.money<BAIT_BOX_PRICE;
    const total=Object.values(s.baits).reduce((n,v)=>n+(Number(v)||0),0);
    const count=document.getElementById("baitTotalCount");
    if(count)count.textContent=`Baits owned: ${total} · 5 independent rolls per box · 5% each`;
    const list=document.getElementById("baitList");
    if(!list)return;
    list.innerHTML='<div class="bait-row"><div><strong>No bait</strong><div class="small">Fish without consuming bait.</div></div><button class="pixel-button small-btn" onclick="equipBait(\'\')" '+(!name?'disabled':'')+'>'+(!name?'Equipped':'Unequip')+'</button></div>'+
      BAIT_TYPES.filter(b=>b.name!=="Suspicious Bait" || (s.baits[b.name]||0)>0).map(b=>{
        const qty=s.baits[b.name]||0,active=name===b.name;
        return `<div class="bait-row ${active?"bait-selected":""}"><div class="bait-info"><strong>${b.name}</strong><div class="small">${b.description}</div><div class="small">Box roll: 5% · Owned: ${qty}</div></div><button class="pixel-button small-btn" ${!qty||active?"disabled":""} onclick="equipBait('${b.name}')">${active?"Equipped":"Equip"}</button></div>`;
      }).join("");
  }
  migrateOldQuestBait();
  return {add,selected,prepare,consume,equip,openBox,buyBox,render,definitions:BAIT_TYPES};
};
