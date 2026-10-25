// Untitled Fishing 1.6 Part 2: Adventures, temples, quests and rod upgrades
window.createPart2 = function(api) {
  const st = () => api.state();
  const sites = {
    cave:{name:"Rainbow Cave",fish:["Heatfish","Snowfish","Bloomfish","Fallfish"]},
    waterfalls:{name:"Rainbow Waterfalls",fish:["Dogfish","Viperfish","Dragonfish","Spikefish"]},
    horizon:{name:"Rainbow Horizon",fish:["Rainbow Runningfish","Aurorus Anglerfish","Flarice Eel","Poisonous Starfish","Fragrant Bass","Totemfish","Beach Ball","Damp Lamp"]}
  };
  const temples = {
    bloom:{name:"The Bloom Temple",blessing:"Blooming Blessing",description:["5 Fungus Alligators to enter","10 Spring-only fish"]},
    thrive:{name:"The Thrive Temple",blessing:"Thriving Blessing",description:["1 Flarice Eel, 8 Heatfish, 1 Snowfish","10 Summer-only fish"]},
    harvest:{name:"The Harvest Temple",blessing:"Harvest Blessing",description:["15 Autumn-only fish","1 Black Pearl"]},
    shivering:{name:"The Shivering Temple",blessing:"Shivering Blessing",description:["5 Unknown fish","10,000 Gold"]},
    rainbow:{name:"The Rainbow Temple",blessing:null,description:["Insert all four Blessings","5 Black Pearls + 1 Luminescent Pearl"]}
  };
  const blessings = Object.values(temples).map(x=>x.blessing).filter(Boolean);
  const questData = {
    n30n:[
      {name:"Catch 1 Luminescent Pearl",goal:1,test:(n)=>n==="Luminescent Pearl",reward:"5,000g"},
      {name:"Catch 10 Zenith-mutated fish",goal:10,test:(n,m)=>m==="Zenith Mutation",reward:"3,000g"},
      {name:"Catch a Zenith-mutated Blue Whale",goal:1,test:(n,m)=>n==="Blue Whale" && m==="Zenith Mutation",reward:"Neon Lights"}
    ],
    deity:[
      {name:"Catch a Gravitational Orbiting Orchidfish",goal:1,test:(n,m)=>n==="Orbiting Orchidfish" && m==="Gravitational Mutation",reward:"10 Brine Bait"},
      {name:"Catch an Eerie Mosasaurus",goal:1,test:(n,m)=>n==="Mosasaurus" && m==="Eerie Mutation",reward:"10,000g"},
      {name:"Catch & Return 10 Black Pearls",goal:10,test:n=>n==="Black Pearl",reward:"Cosmic Pearl",returnFish:true},
      {name:"Catch a Sacred Tiki Totem",goal:1,test:(n,m)=>n==="Tiki Totem" && m==="Sacred Mutation",reward:"Magnificent Melody"}
    ]
  };
  let tab="adventuring";
  function sync(){
    const s=st();
    if(!Array.isArray(s.adventureSites))s.adventureSites=[];
    if(!Array.isArray(s.adventureTemples))s.adventureTemples=[];
    if(!s.adventureMinorUses || typeof s.adventureMinorUses!=="object")s.adventureMinorUses={};
    if(!s.templeStages || typeof s.templeStages!=="object")s.templeStages={};
    if(!s.quests || typeof s.quests!=="object")s.quests={};
    for(const k of ["n30n","deity"]){
      if(!s.quests[k] || typeof s.quests[k]!=="object")s.quests[k]={stage:0,progress:0};
    }
    if(!Array.isArray(s.secretDiscovered))s.secretDiscovered=[];
    if(!Number.isFinite(s.adventureLastWeek))s.adventureLastWeek=-1;
    if(!Number.isFinite(s.sunslasherLevel))s.sunslasherLevel=1;
    if((s.caught.Map||0)>0)s.adventureUnlocked=true;
    for(const n of ["Cosmic Pearl","The Sun Idol","The Moon Idol"]){
      if((s.caught[n]||0)>0 && !s.secretDiscovered.includes(n))s.secretDiscovered.push(n);
    }
  }
  // An in-game day is a ten-minute DAY period, followed by an uncounted night.
  // A Sunstone advances the phase by exactly one period and therefore advances
  // completed days when it skips day->night, but never when it skips night->day.
  function completedDays(){
    const s=st();
    const phase=Math.max(0,Math.floor((Date.now()-s.cycleStart)/PERIOD_MS));
    return Math.floor((phase+1)/2);
  }
  function week(){return Math.floor(completedDays()/7);}
  function count(name){
    return Object.values(st().inventory||{}).reduce((v,item)=>v+(item.displayName===name?item.count:0),0);
  }
  function countWhere(fn){
    return Object.values(st().inventory||{}).filter(x=>fn(x)).reduce((v,x)=>v+x.count,0);
  }
  function takeWhere(fn,qty){
    if(countWhere(fn)<qty)return false;
    let left=qty;
    for(const [key,item] of Object.entries(st().inventory)){
      if(left<=0)break;
      if(!fn(item))continue;
      const amount=Math.min(left,item.count);
      item.count-=amount; left-=amount;
      if(item.count<=0)delete st().inventory[key];
    }
    return true;
  }
  function take(name,qty=1){return takeWhere(i=>i.displayName===name,qty);}
  function grant(name,qty=1,mutation=null,mult=1){
    const f=api.fish(name);
    api.addInventory(name,f?f[2]:0,mutation,mult,qty);
    if(name.endsWith("Blessing"))api.favorite(name,true);
    if(f){
      st().caught[name]=(st().caught[name]||0)+qty;
      if(f[1]==="Secret")discoverSecret(name);
    }
  }
  function discoverSecret(name){
    sync();
    if(!st().secretDiscovered.includes(name)){
      st().secretDiscovered.push(name);
      api.log("Discovered Secret: "+name+"! Its hidden Bestiary entry is now revealed.","success");
    }
    api.favorite(name,true);
  }
  function randomFish(pool){
    const available=pool.map(name=>api.fish(name)).filter(Boolean);
    if(!available.length)return null;
    const weights={Common:58,Uncommon:25,Rare:10,Mythical:4,Legendary:1.5,Unknown:.25,Extinct:.05,Secret:.001};
    const total=available.reduce((v,f)=>v+(weights[f[1]]||1),0);
    let roll=Math.random()*total;
    for(const f of available){roll-=weights[f[1]]||1;if(roll<=0)return f;}
    return available[available.length-1];
  }
  function adventureDraw(){
    const s=st();
    const categories=["gold","fish","site","temple"];
    const category=categories[Math.floor(Math.random()*categories.length)];
    if(category==="gold"){
      const gold=50+Math.floor(Math.random()*4951);
      s.money+=gold;
      return "Found "+gold.toLocaleString()+" Gold.";
    }
    if(category==="fish"){
      const adventureFish=api.allFish().filter(f=>f[5]&&f[5].adventure && (f[1]!=="Secret"||Math.random()<.001));
      const f=randomFish(adventureFish.map(x=>x[0]));
      if(f){grant(f[0]);return "Found and collected "+f[0]+" (direct inventory reward).";}
      s.money+=50;return "Found 50 Gold.";
    }
    if(category==="site"){
      const options=Object.keys(sites).filter(id=>!s.adventureSites.includes(id));
      if(options.length){
        const id=options[Math.floor(Math.random()*options.length)];
        s.adventureSites.push(id);
        return "Discovered "+sites[id].name+"! It is permanently unlocked.";
      }
    }
    if(category==="temple" || category==="site"){
      const options=Object.keys(temples).filter(id=>!s.adventureTemples.includes(id));
      if(options.length){
        const id=options[Math.floor(Math.random()*options.length)];
        s.adventureTemples.push(id);
        return "Discovered "+temples[id].name+"! Permanently accessible.";
      }
    }
    const gold=50+Math.floor(Math.random()*4951);s.money+=gold;
    return "Found "+gold.toLocaleString()+" Gold instead of a duplicate discovery.";
  }
  function adventureStart(){
    sync();
    if(st().location!=="rainbow" || !st().adventureUnlocked || st().adventureLastWeek===week())return;
    st().adventureLastWeek=week();
    const findings=[adventureDraw(),adventureDraw()];
    st().adventureLastFindings=findings;
    api.log("Adventure completed: "+findings.join(" | "),"success");
    api.render();
  }
  function minorCast(id){
    sync();
    if(st().location!=="rainbow" || !st().adventureSites.includes(id) || !sites[id])return;
    const key=id+":"+week();
    const used=st().adventureMinorUses[key]||0;
    if(used>=2){api.log("Only 2 casts per Minor Location per in-game week.","warning");return;}
    const f=randomFish(sites[id].fish);
    if(!f)return;
    st().adventureMinorUses[key]=used+1;
    api.startMinigame(f,100*(1/sites[id].fish.length));
    api.save();
  }
  function templeStage(id){
    sync();
    if(st().location!=="rainbow" || !st().adventureTemples.includes(id) || !temples[id])return;
    const stage=st().templeStages[id]||0;
    if(stage>=2){api.log("You have already completed this temple.","warning");return;}
    let ok=false;
    if(id==="bloom")ok=stage===0?take("Fungus Alligator",5):takeWhere(i=>["Bloomfish","Fragrant Bass","Fungus Alligator"].includes(i.displayName),10);
    if(id==="thrive"){
      if(stage===0){
        if(count("Flarice Eel")>=1 && count("Heatfish")>=8 && count("Snowfish")>=1){
          take("Flarice Eel");take("Heatfish",8);take("Snowfish");ok=true;
        }
      }else ok=takeWhere(i=>["Heatfish","Beach Ball"].includes(i.displayName),10);
    }
    if(id==="harvest")ok=stage===0?take("Fallfish",15):take("Black Pearl");
    if(id==="shivering"){
      if(stage===0)ok=takeWhere(i=>{const f=api.fish(i.displayName);return f?.[1]==="Unknown";},5);
      else if(st().money>=10000){st().money-=10000;ok=true;}
    }
    if(id==="rainbow"){
      if(stage===0){
        if(blessings.every(n=>count(n)>=1)){blessings.forEach(n=>take(n));ok=true;}
      } else if(count("Black Pearl")>=5 && count("Luminescent Pearl")>=1){
        take("Black Pearl",5);take("Luminescent Pearl");ok=true;
      }
    }
    if(!ok){api.log("Temple offering incomplete — check the required fish, items or Gold.","warning");return;}
    st().templeStages[id]=stage+1;
    if(stage+1===2){
      if(id==="rainbow"){
        grant("Cosmic Pearl",1);
        if(!st().owned.includes("keeper16"))st().owned.push("keeper16");
        api.log("Rainbow Temple complete! Cosmic Pearl and Keeper of Rainbows unlocked!","success");
      }else{
        grant(temples[id].blessing);
        api.log(temples[id].name+" complete: "+temples[id].blessing+" obtained!","success");
      }
    }else api.log(temples[id].name+" entrance opened. The next offering is now available.","success");
    api.render();
  }
  function npcUnlocked(id){
    if(id==="n30n")return api.locations.aurora.fish.filter(f=>f[1]!=="Secret").every(f=>(st().caught[f[0]]||0)>0);
    return Object.values(api.events).flat().every(f=>(st().caught[f[0]]||0)>0 || (st().eventCaught?.[f[0]]||0)>0);
  }
  function onCatch(name,mutation){
    sync();
    if(name==="Map")st().adventureUnlocked=true;
    const f=api.fish(name);
    if(f?.[1]==="Secret")discoverSecret(name);
    for(const id of Object.keys(questData)){
      if(!npcUnlocked(id))continue;
      const q=st().quests[id],step=questData[id][q.stage];
      if(step?.test(name,mutation))q.progress=Math.min(step.goal,q.progress+1);
    }
  }
  function claimQuest(id){
    sync();
    if(!questData[id] || !npcUnlocked(id))return;
    const q=st().quests[id],step=questData[id][q.stage];
    if(!step || q.progress<step.goal)return;
    if(step.returnFish && !take("Black Pearl",10)){
      api.log("Return 10 Black Pearls from Inventory to claim this reward.","warning");return;
    }
    if(id==="n30n"){
      if(q.stage===0)st().money+=5000;
      if(q.stage===1)st().money+=3000;
      if(q.stage===2 && !st().owned.includes("neon16"))st().owned.push("neon16");
    }else{
      if(q.stage===0)grant("Brine Bait",10);
      if(q.stage===1)st().money+=10000;
      if(q.stage===2)grant("Cosmic Pearl");
      if(q.stage===3 && !st().owned.includes("melody16"))st().owned.push("melody16");
    }
    api.log((id==="n30n"?"N30N":"Magnificent Deity")+" quest reward claimed: "+step.reward,"success");
    q.stage++;q.progress=0;
    api.render();
  }
  function upgradeSunslasher(){
    sync();
    if(!st().owned.includes("sunslasher"))return;
    const level=st().sunslasherLevel;
    if(level>=5)return;
    const needs=[
      null,
      [["Black Pearl",1]],
      [["Luminescent Pearl",1],["Black Pearl",2]],
      [["Luminescent Pearl",3],["Tanned Megalodon",1]],
      [["Cosmic Pearl",1]]
    ][level];
    if(!needs.every(([n,qty])=>n==="Tanned Megalodon"?
      countWhere(i=>i.displayName==="Megalodon" && i.mutation==="Tanned Mutation")>=qty:count(n)>=qty)){
      api.log("Missing Sunslasher upgrade ingredients.","warning");return;
    }
    for(const [n,qty] of needs){
      if(n==="Tanned Megalodon")takeWhere(i=>i.displayName==="Megalodon"&&i.mutation==="Tanned Mutation",qty);
      else take(n,qty);
    }
    st().sunslasherLevel++;
    api.log("SunSlasher upgraded to "+(st().sunslasherLevel===5?"Final":"V"+st().sunslasherLevel)+"!","success");
    api.render();
  }
  function sunslasherRod(rod){
    const level=Math.max(1,Math.min(5,st().sunslasherLevel||1));
    const values=[[75,50,20],[100,175,47.5],[111,222,66],[200,250,75],[200,250,75]][level-1];
    const desc=[
      "10% / second slash for +10% progress.",
      "50% Tanned (2×); 33% / second slash for +10%.",
      "100% Tanned (2×); 50% / second slash for +5%; 3 bonus shakes lasting 1 second.",
      "50% Tanned, 25% Heated, 25% Lunar at night; 15% duplicate; 75% / 3 seconds slash +25% and slows shakes.",
      "V4 traits + 10% Freshfried (4.1×); 75% / 2 seconds slash +25%."
    ];
    return {...rod,name:level===5?"SunSlasher Final":"SunSlasher V"+level,haste:values[0],luck:values[1],steady:values[2],passive:desc[level-1]};
  }
  function renderAdventure(){
    sync();
    const el=document.getElementById("adventureContent");
    if(!el)return;
    if(st().location!=="rainbow"){
      el.innerHTML="<h3>Adventures</h3><p>Travel to Rainbow Pond to explore.</p>";return;
    }
    if(!st().adventureUnlocked){
      el.innerHTML="<h3>Adventures Locked</h3><p>Catch a Map at Rainbow Pond to unlock weekly Adventures.</p>";return;
    }
    const available=st().adventureLastWeek!==week();
    const tabs=["adventuring","minor","temples"];
    let html='<div class="section-head"><div><div class="pixel-kicker">RAINBOW POND</div><h3>Adventure Journal</h3></div></div>';
    html+='<p class="small">Day '+(completedDays()+1)+' · Week '+(week()+1)+' · '+(completedDays()%7)+'/7 completed days in this week. Sunstone skips count when a Day finishes.</p>';
    html+='<div class="p2-tabs">'+tabs.map(t=>'<button class="pixel-button '+(tab===t?"active":"")+'" onclick="p2Action(\'tab\',\''+t+'\')">'+({adventuring:"Adventuring",minor:"Minor Locations",temples:"Temples"}[t])+'</button>').join("")+'</div>';
    if(tab==="adventuring"){
      html+='<div class="adventure-card"><strong>Two discoveries per weekly Adventure</strong><p>Possible findings: Gold (50–5,000g), Adventure fish, permanent Minor Locations and permanent Temples.</p><button class="pixel-button primary" '+(available?"":"disabled")+' onclick="p2Action(\'adventure\')">'+(available?"Begin Adventure":"Adventure used this week")+'</button></div>';
      if(st().adventureLastFindings?.length)html+='<p class="small">Last discoveries: '+st().adventureLastFindings.join(" | ")+'</p>';
    }
    if(tab==="minor"){
      html+='<div class="p2-grid">'+Object.entries(sites).map(([id,site])=>{
        if(!st().adventureSites.includes(id))return '<div class="adventure-card"><strong>???</strong><span class="small">Not yet discovered</span></div>';
        const count=st().adventureMinorUses[id+":"+week()]||0;
        return '<div class="adventure-card"><strong>'+site.name+'</strong><span class="p2-detail">'+site.fish.join(", ")+'</span><span class="p2-status">'+(2-count)+'/2 weekly casts remaining</span><button class="pixel-button" '+(count>=2?"disabled":"")+' onclick="p2Action(\'cast\',\''+id+'\')">Fish here</button></div>';
      }).join("")+'</div>';
    }
    if(tab==="temples"){
      html+='<div class="p2-grid">'+Object.entries(temples).map(([id,t])=>{
        if(!st().adventureTemples.includes(id))return '<div class="adventure-card"><strong>Undiscovered Temple</strong><span class="small">Find it during an Adventure.</span></div>';
        const stage=st().templeStages[id]||0;
        return '<div class="adventure-card"><strong>'+t.name+'</strong><span class="p2-status">'+(stage>=2?"Completed":stage===0?"Entrance Offering":"Final Offering")+'</span><p class="p2-detail">'+(stage>=2?"Blessing/reward claimed":t.description[stage])+'</p><button class="pixel-button" '+(stage>=2?"disabled":"")+' onclick="p2Action(\'temple\',\''+id+'\')">'+(stage>=2?"Completed":"Offer Ingredients")+'</button></div>';
      }).join("")+'</div>';
    }
    el.innerHTML=html;
  }
  function renderQuests(){
    sync();
    const el=document.getElementById("questsContent");
    if(!el)return;
    let html='<div class="section-head"><div><div class="pixel-kicker">GUARDIAN REQUESTS</div><h3>Quests</h3></div></div>';
    for(const [id,label,description] of [["n30n","N30N","A cyberpunk music creator struggling with influence."],["deity","Magnificent Deity","A divine being who loves tunes."]]){
      const unlocked=npcUnlocked(id),q=st().quests[id],steps=questData[id];
      html+='<div class="quest-card"><strong>'+label+'</strong><span class="small">'+description+'</span>';
      if(!unlocked){
        html+='<p class="p2-detail">Locked: '+(id==="n30n"?"Complete every Aurora Pond non-Secret fish, including optional and Extinct entries.":"Complete every Weather Bestiary, including optional and Extinct entries.")+'</p>';
      } else if(q.stage>=steps.length){
        html+='<p class="p2-status">Questline completed! Rod unlocked.</p>';
      }else{
        const step=steps[q.stage];
        html+='<p>Quest '+(q.stage+1)+' / '+steps.length+': '+step.name+'</p><p class="p2-status">'+q.progress+'/'+step.goal+' catches · Reward: '+step.reward+'</p>';
        if(step.returnFish)html+='<p class="small">Returning these 10 Black Pearls consumes them. Inventory: '+count("Black Pearl")+'</p>';
        html+='<button class="pixel-button" '+(q.progress<step.goal?"disabled":"")+' onclick="p2Action(\'claim\',\''+id+'\')">Claim Reward</button>';
      }
      html+='</div>';
    }
    el.innerHTML=html;
  }
  window.p2Action=function(action,id){
    if(action==="tab"){tab=id;renderAdventure();}
    if(action==="adventure")adventureStart();
    if(action==="cast")minorCast(id);
    if(action==="temple")templeStage(id);
    if(action==="claim")claimQuest(id);
    if(action==="upgrade")upgradeSunslasher();
  };
  sync();
  return {sync,completedDays,week,onCatch,renderAdventure,renderQuests,discoverSecret,upgradeSunslasher,sunslasherRod,minorCast};
};
