// Gameplay, UI rendering, and controls

let state = loadState();
    if(!locations[state.location]) state.location="gravitas";
    if(!rods.some(r=>r.id===state.equipped)) state.equipped="twig";
    if(state.equipped==="sunslasher") state.equipped="twig";
    state.currentWeather=state.weather||state.currentWeather||"Clear";
    let activeMini = null;
    let clockTimer = null;
    let bestiaryFilter = "all";
    let bestiarySearch = "";
    let bestiarySort = "default";
    let activeScreen = state.activeScreen || "fishing";


    function getPeriod() {
      const phase = Math.floor((Date.now() - state.cycleStart) / PERIOD_MS);
      return phase % 2 === 0 ? "day" : "night";
    }

    function getTimeRemaining() {
      const elapsed = (Date.now() - state.cycleStart) % PERIOD_MS;
      return PERIOD_MS - elapsed;
    }

    function getWeatherRemaining() { return WEATHER_MS - ((Date.now() - state.weatherStart) % WEATHER_MS); }

    function updateWeatherState(force=false) {
      const period = getPeriod();
      if (!state.currentPeriod) state.currentPeriod = period;
      if (period !== state.currentPeriod) {
        state.previousPeriod = state.currentPeriod;
        state.lastPeriodWeather = state.weather || "Clear";
        state.currentPeriod = period;
        force = true;
      }
      if (!force && Date.now() - state.weatherStart < WEATHER_MS) return;
      const oldWeather = state.weather || "Clear";
      state.previousWeather = oldWeather;
      state.weatherStart = Date.now();
      if (period === "day" && state.previousPeriod === "night" && state.lastPeriodWeather === "Rainy" && Math.random() < .01) state.weather = "Rainbow";
      else if (period === "night" && Math.random() < .0075) state.weather = "Starstorm";
      else {
        const normal = ["Clear","Clear","Rainy","Windy","Stormy","Sunny"];
        state.weather = normal[Math.floor(Math.random()*normal.length)];
      }
      state.currentWeather = state.weather;
      if (state.weather !== oldWeather) addLog(`Weather changed to ${state.weather}.`, "warning");
    }

    function currentWeather() { updateWeatherState(); return weatherData[state.weather] || weatherData.Clear; }
    function currentWeatherName() { return state.weather || state.currentWeather || "Clear"; }
    function isAuroraUnlocked() { return locationCompletion("gravitas").pct >= 50; }
    function isGrandReefUnlocked() { return locationCompletion("shark").pct >= 50; }
    function eventCompletion(id) {
      const list = eventBestiaries[id] || [];
      const required = list.filter(f => !["optional","elderKelpie"].includes(f[4]));
      const caught = required.filter(f => ((state.eventCaught && state.eventCaught[f[0]]) || state.caught[f[0]] || 0) > 0).length;
      return {caught,total:required.length,pct:required.length ? caught/required.length*100 : 0,complete:caught===required.length};
    }
    function allFishPool() { return [...Object.values(locations).flatMap(l=>l.fish), ...Object.values(eventBestiaries).flat()]; }
    function eventActive(name) { return Date.now() < (state[name] || 0); }
    function isSharkFish(name) { return /Shark|Megalodon|Helipricon/i.test(name); }
    function isWhaleFish(name) { return /Whale|Moby/i.test(name); }

    function currentRod() {
      return rods.find(r => r.id === state.equipped) || rods[0];
    }

    function effectiveStats(rod=currentRod()) {
      let stats = { haste:rod.haste, luck:rod.luck, steady:rod.steady };

      if (rod.id === "splitbranch" && state.splitMode === 1) {
        stats = {...rod.alt};
      }

      if (rod.id === "snowflake") {
        const factor = Math.max(0, state.snowflakeIntegrity) / 100;
        stats.haste *= factor;
        stats.luck *= factor;
        stats.steady *= factor;
      }

      if (rod.id === "aurora") {
        if (getPeriod() === "night") {
          stats.luck *= 2;
          stats.steady *= 3;
        } else {
          stats.steady *= .5;
        }
      }

      if (Date.now() < (state.luckBoostUntil || 0)) stats.luck *= 2;
      const weather = currentWeather();
      stats.haste += weather.haste;
      stats.luck = (stats.luck + weather.luckAdd) * weather.luckMult;
      stats.steady += weather.steadyAdd || 0;
      if (eventActive("sharkMigrationUntil") && state.location === "shark") stats.luck *= 1.5;
      if (rod.id === "megaLoad" && state.megaLuckStacks > 0) stats.luck *= 1 + state.megaLuckStacks * .075;
      return stats;
    }

    function requiredFish(locationId) {
      return locations[locationId].fish.filter(f => {
        if (locationId === "shark") return !["moby","migration"].includes(f[4]);
        return !["optional","dayOptional","lunar"].includes(f[4]);
      });
    }

    function locationCompletion(locationId) {
      const req = requiredFish(locationId);
      const caught = req.filter(f => (state.caught[f[0]] || 0) > 0).length;
      return { caught, total:req.length, complete:caught === req.length, pct:req.length ? caught / req.length * 100 : 0 };
    }

    function migrationCompletion(type) {
      let entries = [];
      if (type === "shark") entries = locations.shark.fish.filter(f => isSharkFish(f[0]) || ["migration","migrationRequired"].includes(f[4]));
      if (type === "whale") entries = locations.shark.fish.filter(f => ["Blue Whale","Moby"].includes(f[0]));
      const caught = entries.filter(f => (state.caught[f[0]] || 0) > 0).length;
      return { caught, total:entries.length, complete:entries.length > 0 && caught === entries.length };
    }

    function requirementMet(rod) {
      if (rod.unavailable) return false;
      if (!rod.requirement) return true;
      if (rod.requirement === "gravitas") return locationCompletion("gravitas").complete;
      if (rod.requirement === "aurora") return locationCompletion("aurora").complete;
      if (rod.requirement === "all") return locationCompletion("gravitas").complete && locationCompletion("aurora").complete && locationCompletion("shark").complete;
      if (rod.requirement === "bellona15") return locationOrder.every(id => locationCompletion(id).complete) && migrationCompletion("shark").complete && migrationCompletion("whale").complete;
      if (rod.requirement === "shark25") return locationCompletion("shark").pct >= 25;
      if (rod.requirement === "shark50") return locationCompletion("shark").pct >= 50;
      if (rod.requirement === "shark") return locationCompletion("shark").complete;
      if (rod.requirement === "grandreefUnlocked") return isGrandReefUnlocked();
      if (rod.requirement === "grandreef25") return locationCompletion("grandreef").pct >= 25;
      if (rod.requirement === "grandreef100") return locationCompletion("grandreef").complete;
      if (rod.requirement === "eventMaster") return locationCompletion("grandreef").complete && eventCompletion("eclipse").complete && eventCompletion("flood").complete && eventCompletion("acid").complete && eventCompletion("drought").complete;
      return true;
    }

    function isLocationUnlocked(id) {
      if (id === "gravitas") return true;
      if (id === "aurora") return locationCompletion("gravitas").pct >= 50;
      if (id === "shark") return locationCompletion("aurora").pct >= 50;
      if (id === "grandreef") return locationCompletion("shark").pct >= 50;
      return false;
    }

    function formatMoney(value) {
      return "$" + Math.round(value).toLocaleString();
    }

    function addLog(text, cls="") {
      state.logs.unshift({text, cls, t:Date.now()});
      state.logs = state.logs.slice(0, 30);
      saveState();
      renderLog();
    }

    function renderLog() {
      const el = document.getElementById("log");
      el.innerHTML = state.logs.map(entry => {
        if (typeof entry === "string") return `<div class="log-entry">${entry}</div>`;
        return `<div class="log-entry ${entry.cls || ""}">${entry.text}</div>`;
      }).join("");
    }

    function slugify(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

    const spriteAssets = {
      trout: "assets/sprites/trout.png",
      bass: "assets/sprites/bass.png",
      snapper: "assets/sprites/snapper.png",
      catfish: "assets/sprites/catfish.png",
      angler: "assets/sprites/angler.png",
      marlin: "assets/sprites/marlin.png",
      shark: "assets/sprites/shark.png",
      aurora: "assets/sprites/aurora.png",
      reef: "assets/sprites/reef.png",
      skeletal: "assets/sprites/skeletal.png",
      koi: "assets/sprites/koi.png",
      dragon: "assets/sprites/dragon.png",
      item: "assets/sprites/item.png",
      coral: "assets/sprites/coral.png",
      bag: "assets/sprites/bag.png"
    };

    function getSpecificFishSprite(name) {
      return `assets/fish/${slugify(name)}.png`;
    }

    function getFishSprite(name, rarity, item = false, condition = "") {
      if (name) return getSpecificFishSprite(name);
      const n = String(name || '').toLowerCase();
      if (item || /rubbish|algae|egg|fertilizer|treasure|rod|skull|coconut|seagull|parasite|clam|pearl|bait box|bone|fish piece|coral piece/.test(n)) return spriteAssets.item;
      if (/coral/.test(condition) && /fish|wrasse|goby|tang|parrot|trigger|damselfish/.test(n)) return spriteAssets.coral;
      if (/godgazer|hydra|leviathan/.test(n)) return spriteAssets.dragon;
      if (/serpent|skele|phantom|dissolving danger/.test(n)) return spriteAssets.skeletal;
      if (/trout|salmon/.test(n)) return spriteAssets.trout;
      if (/bass|pike|grouper|toadfish/.test(n)) return spriteAssets.bass;
      if (/snapper|lionfish/.test(n)) return spriteAssets.snapper;
      if (/catfish/.test(n)) return spriteAssets.catfish;
      if (/angler|venomfish/.test(n)) return spriteAssets.angler;
      if (/swordfish|sawfish|marlin|mackerel|flying fish/.test(n)) return spriteAssets.marlin;
      if (/shark|moby|whale|manta|dolphin|mosasaurus|helipricon|megalodon|krab/.test(n)) return spriteAssets.shark;
      if (/orchidfish|reefrunner|rainbow tang|prismize goby|mermaid|kelpie|kappa/.test(n)) return spriteAssets.aurora;
      if (/clownfish|angelfish|butterflyfish|triggerfish|tang|damselfish|wrasse|seahorse/.test(n)) return spriteAssets.reef;
      if (/goldfish/.test(n)) return spriteAssets.koi;
      if (String(rarity || '').toLowerCase().match(/unknown|extinct/) || /lunar lurker|dawn's devil|starlight|phantom fang/.test(n)) return spriteAssets.dragon;
      return rarity === "Legendary" ? spriteAssets.dragon : spriteAssets.reef;
    }

    function currentEventSummary() {
      const events=[];
      if(eventActive("sharkMigrationUntil")) events.push("Shark Migration");
      if(eventActive("whaleAbundanceUntil")) events.push("Whale Migration");
      return events.length ? events.join(" + ") : "No Event";
    }

    function weatherSummary(name) {
      const map = {
        "Clear": "Balanced conditions with no bonuses.",
        "Rainy": "+10 Luck, -7.5 Haste.",
        "Windy": "+5 Haste from tailwinds.",
        "Stormy": "+30 Haste, -10 Luck, shorter shake windows.",
        "Sunny": "Shake targets stay 10% longer.",
        "Rainbow": "3× Luck, +0.2× value, bonus rainbow mutations.",
        "Starstorm": "2× Luck, +0.33× value, high Lunar mutation chance.",
        "Eclipse": "Sinister skies: 10% Evil Mutation.",
        "Acid Rain": "+50 Luck, -30 Steadiness, fish become Acidic.",
        "Drought": "Only Superlure rods can fish.",
        "Flood": "Unusual fish are available.",
        "Tsunami": "All fish become catchable."
      };
      return map[name] || "Conditions are shifting.";
    }

    function applySceneTheme() {
      const period = getPeriod();
      const weatherName = currentWeatherName();
      document.body.dataset.location = state.location;
      document.body.dataset.period = period;
      document.body.dataset.weather = slugify(weatherName);
      document.body.dataset.event = slugify(currentEventSummary());
      const hero = document.getElementById("locationHero");
      if (hero) {
        hero.classList.toggle("gravitas", state.location === "gravitas");
        hero.classList.toggle("aurora", state.location === "aurora");
        hero.classList.toggle("shark", state.location === "shark");
        hero.classList.toggle("reef", state.location === "grandreef");
      }
    }

    function setScreen(screen) {
      activeScreen = screen;
      state.activeScreen = screen;
      document.querySelectorAll('.screen-view').forEach(view => view.classList.toggle('active', view.id === `screen-${screen}`));
      const launch = document.getElementById('launchpadModal');
      if (launch) launch.classList.remove('active');
      saveState();
    }

    function renderFishingPanel() {
      const rod = currentRod();
      const stats = effectiveStats(rod);
      const weatherName = currentWeatherName();
      const waitSeconds = Math.max(0, (100 - stats.haste) * .075);
      const sceneKicker = document.getElementById('sceneKicker');
      if (sceneKicker) sceneKicker.textContent = `${locations[state.location].name} • ${getPeriod() === 'day' ? 'Day' : 'Night'} • ${weatherName}`;
      const castEta = document.getElementById('castEtaLabel');
      if (castEta) castEta.textContent = waitSeconds <= 0 ? 'Lure ETA: instant bite' : `Lure ETA: ${waitSeconds.toFixed(2)}s`;
      const bagName = document.getElementById('bagEquippedName');
      if (bagName) bagName.textContent = rod.name;
      const bagStats = document.getElementById('bagEquippedStats');
      if (bagStats) bagStats.textContent = `${stats.haste.toFixed(2)} Haste • ${stats.luck.toFixed(2)} Luck • ${stats.steady.toFixed(2)} Steadiness`;
      const bagPassive = document.getElementById('bagEquippedPassive');
      if (bagPassive) bagPassive.textContent = rod.passive || rod.unlock || 'Simple but dependable.';
      const weatherBuff = document.getElementById('weatherBuffSummary');
      if (weatherBuff) weatherBuff.textContent = weatherSummary(weatherName);
      const eventSummary = document.getElementById('eventSummary');
      if (eventSummary) eventSummary.textContent = currentEventSummary() === 'No Event' ? 'Nothing unusual is happening.' : `${currentEventSummary()} is active.`;
    }

    function renderRodBag() {
      const el = document.getElementById('rodBagList');
      if (!el) return;
      const owned = rods.filter(r => state.owned.includes(r.id));
      el.innerHTML = owned.map(rod => {
        const equipped = rod.id === state.equipped;
        const sprite = spriteAssets.bag;
        return `<div class="bag-row"><div class="bag-row-main"><img src="${sprite}" alt="Rod bag icon"><div><strong>${rod.name}</strong><div class="small">${rod.haste} Haste • ${rod.luck} Luck • ${rod.steady} Steadiness</div><div class="small">${rod.passive || 'No passive.'}</div></div></div><button class="pixel-button" ${equipped ? 'disabled' : ''} onclick="equipRod('${rod.id}')">${equipped ? 'Equipped' : 'Equip'}</button></div>`;
      }).join('') || '<p class="small">No rods owned.</p>';
    }

    function renderLog() {
      const el = document.getElementById("log");
      el.innerHTML = state.logs.map(entry => {
        if (typeof entry === "string") return `<div class="log-entry">${entry}</div>`;
        return `<div class="log-entry ${entry.cls || ""}">${entry.text}</div>`;
      }).join("");
    }

    function showResult(title, text) {
      const spriteWrap = document.getElementById('resultSpriteWrap');
      const sprite = document.getElementById('resultSprite');
      const breakdown = document.getElementById('resultBreakdown');
      spriteWrap.style.display = 'none';
      sprite.removeAttribute('src');
      breakdown.innerHTML = '';
      document.getElementById("resultTitle").textContent = title;
      document.getElementById("resultText").textContent = text;
      document.getElementById("resultModal").classList.add("active");
    }

    function showCatchResult(payload) {
      const spriteWrap = document.getElementById('resultSpriteWrap');
      const sprite = document.getElementById('resultSprite');
      const breakdown = document.getElementById('resultBreakdown');
      spriteWrap.style.display = 'grid';
      sprite.src = getFishSprite(payload.name, payload.rarity, payload.item, payload.condition);
      sprite.alt = payload.name;
      document.getElementById('resultTitle').textContent = `${payload.rarity} ${payload.name}`;
      document.getElementById('resultText').textContent = payload.summary;
      const mutationLabel = payload.mutation ? `${payload.mutation} ×${payload.multiplier.toFixed(2)}` : 'Normal ×1.00';
      breakdown.innerHTML = `
        <div><span>Base Value</span><strong>${formatMoney(payload.basePrice)}</strong></div>
        <div><span>Mutation</span><strong>${mutationLabel}</strong></div>
        <div><span>Weather Multiplier</span><strong>×${payload.weatherValue.toFixed(2)}</strong></div>
        <div><span>Final Unit Value</span><strong>${formatMoney(payload.finalUnitValue)}</strong></div>
      `;
      document.getElementById('resultModal').classList.add('active');
    }

    function buildMiniDecor(fish) {
      const decor = document.getElementById('miniDecor');
      if (!decor) return;
      const inCoral = state.location === 'grandreef' || fish[4] === 'coral';
      const weather = currentWeatherName();
      decor.innerHTML = `
        <div class="foam"></div>
        <div class="rock" style="left: 18px"></div>
        <div class="weed" style="left: 150px"></div>
        <div class="rock" style="right: 28px; width: 160px;"></div>
        <div class="weed" style="right: 190px; height: 140px;"></div>
        ${inCoral ? '<div class="coral" style="left: 48px"></div><div class="coral" style="right: 82px; transform: scale(.85)"></div>' : ''}
        ${(weather === 'Eclipse') ? '<div class="rock" style="left: 50%; bottom: auto; top: 52px; width: 80px; height: 50px; opacity:.35"></div>' : ''}
      `;
    }

    function render() {
      const period = getPeriod();
      document.getElementById("money").textContent = formatMoney(state.money);
      document.getElementById("equippedTop").textContent = currentRod().name;
      document.getElementById("periodIcon").textContent = period === "day" ? "☀" : "☾";
      document.getElementById("periodLabel").textContent = period === "day" ? "Day" : "Night";

      const loc = locations[state.location];
      document.getElementById("locationName").textContent = loc.name;
      document.getElementById("locationDesc").textContent = loc.desc;
      document.getElementById("fishButton").textContent = `Cast with ${currentRod().name}`;

      const stats = effectiveStats();
      document.getElementById("activeStats").innerHTML =
        `<strong>Haste:</strong> ${stats.haste.toFixed(2)} &nbsp; <strong>Luck:</strong> ${stats.luck.toFixed(2)} &nbsp; <strong>Steadiness:</strong> ${stats.steady.toFixed(2)}`;

      const comp = locationCompletion(state.location);
      document.getElementById("areaProgress").style.width = `${comp.pct}%`;
      document.getElementById("areaCompletionText").textContent = `${comp.caught}/${comp.total} required species discovered (${comp.pct.toFixed(0)}%)`;

      const switchBtn = document.getElementById("switchLocationBtn");
      const unlocked=locationOrder.filter(isLocationUnlocked);
      const idx=unlocked.indexOf(state.location);
      const nextId=unlocked[(idx+1)%unlocked.length];
      switchBtn.dataset.next=nextId;
      switchBtn.textContent=unlocked.length>1?`Travel to ${locations[nextId].name}`:"More locations locked";
      switchBtn.disabled=unlocked.length<=1;
      document.getElementById("sunMaskCount").textContent = `Owned: ${state.sunMasks || 0}`;
      document.getElementById("useSunMaskBtn").disabled = !(state.sunMasks > 0);
      applySceneTheme();
      renderFishingPanel();
      renderRods();
      renderBestiary();
      renderInventory();
      renderRodBag();
      renderCodeEffects();
      renderLog();
      updateClock();
      setScreen(activeScreen);
      saveState();
    }

    function renderRods() {
      const el = document.getElementById("rods");
      const sorted = [...rods].sort((a,b) => {
        if (state.rodSort === "nameZA") return b.name.localeCompare(a.name);
        if (state.rodSort === "priceUp") return a.price - b.price || a.name.localeCompare(b.name);
        if (state.rodSort === "priceDown") return b.price - a.price || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });

      el.innerHTML = `<div class="section-head"><div><div class="pixel-kicker">ARMORY</div><h3>Rod Collection</h3></div>
          <select id="rodSortSelect" aria-label="Sort rods">
            <option value="nameAZ" ${state.rodSort === "nameAZ" ? "selected" : ""}>Name: A–Z</option>
            <option value="nameZA" ${state.rodSort === "nameZA" ? "selected" : ""}>Name: Z–A</option>
            <option value="priceUp" ${state.rodSort === "priceUp" ? "selected" : ""}>Price: Low–High</option>
            <option value="priceDown" ${state.rodSort === "priceDown" ? "selected" : ""}>Price: High–Low</option>
          </select>
        </div>` + sorted.map(rod => {
        const owned = state.owned.includes(rod.id);
        const locationMet = (!rod.shoreOnly || state.location === "shark") && (!rod.shopLocation || rod.shopLocation === state.location);
        const met = requirementMet(rod) && locationMet;
        const equipped = state.equipped === rod.id;
        let stats = `${rod.haste} Haste · ${rod.luck} Luck · ${rod.steady} Steadiness`;
        if (rod.id === "splitbranch") stats += ` / Alt: -5 Haste · 88 Luck · 0 Steadiness`;
        if (rod.id === "snowflake" && owned) stats += ` · Integrity ${state.snowflakeIntegrity.toFixed(0)}%`;
        let button = "";
        if (owned) button = `<button class="pixel-button" ${equipped ? "disabled" : ""} onclick="equipRod('${rod.id}')">${equipped ? "Equipped" : "Equip"}</button>`;
        else button = `<button class="pixel-button" ${(!met || state.money < rod.price) ? "disabled" : ""} onclick="buyRod('${rod.id}')">Buy ${formatMoney(rod.price)}</button>`;
        return `<div class="rod-card"><div class="rod-head"><div><strong>${rod.name}</strong><div class="rod-stats">${stats}</div></div>${button}</div><div class="small">${rod.passive || "No passive."}</div><div class="small">${owned ? "Owned" : rod.unlock}${!locationMet ? ` — only sold at ${rod.shoreOnly ? "Shark Shores" : locations[rod.shopLocation]?.name || "its home area"}` : (!met ? " — requirement not met" : "")}</div></div>`;
      }).join("");

      document.getElementById("rodSortSelect").addEventListener("change", event => {
        state.rodSort = event.target.value;
        saveState();
        renderRods();
      });
    }

    function renderBestiary() {
      const el = document.getElementById("bestiary");
      const locationFilters = [
        { id:"loc:gravitas", label:"Gravitas Waterfall", location:"gravitas" },
        { id:"loc:aurora", label:"Aurora Pond", location:"aurora" },
        { id:"loc:shark", label:"Shark Shores", location:"shark" },
        { id:"loc:grandreef", label:"The Grand Reef", location:"grandreef" }
      ];
      const eventFilters = [
        { id:"event:sharkMigration", label:"Shark Migration", entries:locations.shark.fish.filter(f=>isSharkFish(f[0])||f[4]==="migration"||f[4]==="migrationRequired") },
        { id:"event:whaleAbundance", label:"Whale Migration", entries:locations.shark.fish.filter(f=>f[0]==="Blue Whale"||f[0]==="Moby") }
      ];
      const weatherFilters = [
        { id:"weather:eclipse", label:"Eclipse", eventId:"eclipse" },
        { id:"weather:flood", label:"Flood", eventId:"flood" },
        { id:"weather:acid", label:"Acid Rain", eventId:"acid" },
        { id:"weather:drought", label:"Drought", eventId:"drought" }
      ];
      const allUnique=[]; const seen=new Set();
      const addUnique=entries=>{for(const f of entries){if(!seen.has(f[0])){seen.add(f[0]);allUnique.push(f);}}};
      Object.values(locations).forEach(loc=>addUnique(loc.fish));
      Object.values(eventBestiaries).forEach(list=>addUnique(list));

      let title="All Fish", subtitle="A record of every creature beneath the waves.", entries=allUnique, completionMode="all";
      if(bestiaryFilter.startsWith("loc:")){
        const id=bestiaryFilter.slice(4);
        if(locations[id]){title=locations[id].name;subtitle=locations[id].desc;entries=locations[id].fish;completionMode=`location:${id}`;}
      } else if(bestiaryFilter.startsWith("event:")){
        const filter=eventFilters.find(x=>x.id===bestiaryFilter);
        if(filter){title=filter.label;subtitle=filter.id==="event:sharkMigration"?"Sharks and ancient predators linked to the migration.":"Blue Whale encounters and the rare Moby replacement.";entries=filter.entries;completionMode="collection";}
      } else if(bestiaryFilter.startsWith("weather:")){
        const filter=weatherFilters.find(x=>x.id===bestiaryFilter);
        if(filter){title=filter.label;subtitle=`${filter.label} weather bestiary.`;entries=eventBestiaries[filter.eventId]||[];completionMode=`weather:${filter.eventId}`;}
      }

      const query=bestiarySearch.trim().toLowerCase();
      let visibleEntries=query?entries.filter(f=>f[0].toLowerCase().includes(query)||f[1].toLowerCase().includes(query)||(fishDescriptions[f[0]]||"").toLowerCase().includes(query)):entries;

      const isCaught=name=>(state.caught[name]||0)>0||(state.eventCaught?.[name]||0)>0;
      function categoryProgress(){
        if(completionMode.startsWith("location:")){const c=locationCompletion(completionMode.split(":")[1]);return {caught:c.caught,total:c.total,pct:c.pct};}
        if(completionMode.startsWith("weather:")){const c=eventCompletion(completionMode.split(":")[1]);return {caught:c.caught,total:c.total,pct:c.pct};}
        const unique=[],names=new Set();for(const f of entries){if(!names.has(f[0])){names.add(f[0]);unique.push(f);}}
        const caught=unique.filter(f=>isCaught(f[0])).length;return {caught,total:unique.length,pct:unique.length?caught/unique.length*100:0};
      }
      if (bestiarySort === 'name') visibleEntries = [...visibleEntries].sort((a,b)=>a[0].localeCompare(b[0]));
      if (bestiarySort === 'rarity') visibleEntries = [...visibleEntries].sort((a,b)=>rarityOrder.indexOf(a[1]) - rarityOrder.indexOf(b[1]) || a[0].localeCompare(b[0]));
      if (bestiarySort === 'value') visibleEntries = [...visibleEntries].sort((a,b)=>b[2]-a[2] || a[0].localeCompare(b[0]));

      const progress=categoryProgress();
      const filterButton=(id,label,extra="")=>`<button class="bestiary-nav-btn ${bestiaryFilter===id?"active":""}" data-bestiary-filter="${id}"><span>${label}</span>${extra}</button>`;
      const locationButtons=locationFilters.map(x=>{const c=locationCompletion(x.location);return filterButton(x.id,x.label,`<small>${c.caught} / ${c.total}</small>`)}).join("");
      const eventButtons=eventFilters.map(x=>{const caught=x.entries.filter(f=>isCaught(f[0])).length;return filterButton(x.id,x.label,`<small>${caught} / ${x.entries.length}</small>`)}).join("");
      const weatherButtons=weatherFilters.map(x=>{const c=eventCompletion(x.eventId);return filterButton(x.id,x.label,`<small>${c.caught} / ${c.total}</small>`)}).join("");
      const cards=visibleEntries.map(f=>{
        const [name,rarity,price,item,condition]=f;
        const count=Math.max(state.caught[name]||0,state.eventCaught?.[name]||0);
        const caught=count>0;
        const secret=["Unknown","Extinct"].includes(rarity);
        const displayName=!caught&&secret?"???":name;
        const desc=!caught&&secret?"Its identity remains hidden until you catch it.":(fishDescriptions[name]||"No description recorded.");
        const thumb = getFishSprite(name, rarity, item, condition);
        let conditionText="";
        if(condition==="day")conditionText="Day only"; if(condition==="night")conditionText="Night only"; if(condition==="dayOptional")conditionText="Day only · Optional"; if(condition==="lunar")conditionText="10% Mosslurker replacement"; if(condition==="optional")conditionText="Optional"; if(condition==="whale")conditionText="Whale Migration"; if(condition==="moby")conditionText="10% Blue Whale replacement"; if(condition==="migration")conditionText="Shark Migration"; if(condition==="migrationRequired")conditionText="Shark Migration · Required"; if(condition==="coral")conditionText="Hides in Coral"; if(condition==="reefTitan")conditionText="10% Reef Titan replacement"; if(condition==="required")conditionText="Required"; if(condition==="elderKelpie")conditionText="10% Kelpie replacement";
        return `<article class="bestiary-list-card ${caught?"caught":"uncaught"}"><div class="bestiary-thumb ${(!caught&&secret)?'locked':''}"><img src="${thumb}" alt="${displayName}"></div><div class="bestiary-copy"><div class="bestiary-card-top"><div><strong>${displayName}</strong></div><span class="badge ${rarity}">${rarity}</span></div><p>${desc}</p><div class="bestiary-meta"><span>${caught?`Caught: ${count}`:"Undiscovered"}</span><span>${caught||!secret?`Value: ${price}g`:"Value ???"}</span>${conditionText?`<span>${conditionText}</span>`:""}${item?`<span>Item Catch</span>`:""}</div></div></article>`;
      }).join("");

      el.innerHTML = `<div class="bestiary-shell"><aside class="bestiary-sidebar"><div class="bestiary-side-title">BESTIARY</div><div class="bestiary-side-sub">Discover • Catch • Learn</div>${filterButton("all","All Fish",`<small>${allUnique.filter(f=>isCaught(f[0])).length} / ${allUnique.length}</small>`)}<div class="bestiary-group-title">Locations</div>${locationButtons}<div class="bestiary-group-title">Events</div>${eventButtons}<div class="bestiary-group-title">Weather</div>${weatherButtons}</aside><section class="bestiary-main"><div class="bestiary-header"><div class="bestiary-title"><div class="pixel-kicker">FISH BESTIARY</div><h3>${title}</h3><p>${subtitle}</p></div><div class="completion-box"><span class="mini-label">Completion</span><div class="progress-shell"><div class="progress-bar" style="width:${progress.pct}%"></div></div><div class="completion-big"><span>${progress.caught} / ${progress.total} Caught</span><strong>${progress.pct.toFixed(0)}%</strong></div></div></div><div class="bestiary-toolbar"><input id="bestiarySearch" type="search" placeholder="Search fish..." value="${bestiarySearch.replaceAll('"','&quot;')}"><div class="toolbar-right"><select id="bestiarySort"><option value="default" ${bestiarySort==='default'?'selected':''}>Sort: Default</option><option value="name" ${bestiarySort==='name'?'selected':''}>Sort: Name</option><option value="rarity" ${bestiarySort==='rarity'?'selected':''}>Sort: Rarity</option><option value="value" ${bestiarySort==='value'?'selected':''}>Sort: Value</option></select><span class="view-pill">▦</span><span class="view-pill">≣</span></div></div><div class="bestiary-grid">${cards || `<div class="bestiary-empty">No catches match that search.</div>`}</div><div class="bestiary-footer"><strong>${progress.pct.toFixed(0)}% Completed</strong><span>${visibleEntries.length} shown</span></div></section></div>`;
      el.querySelectorAll('[data-bestiary-filter]').forEach(btn=>btn.addEventListener('click',()=>{bestiaryFilter=btn.dataset.bestiaryFilter;bestiarySearch='';renderBestiary();}));
      const search=document.getElementById('bestiarySearch'); if(search){search.addEventListener('input',e=>{bestiarySearch=e.target.value;renderBestiary();const refreshed=document.getElementById('bestiarySearch');if(refreshed){refreshed.focus();refreshed.setSelectionRange(refreshed.value.length, refreshed.value.length);}});}
      const sortSel=document.getElementById('bestiarySort'); if(sortSel){sortSel.addEventListener('change', e=>{bestiarySort=e.target.value;renderBestiary();});}
    }

    function renderInventory() {
      const el = document.getElementById("inventory");
      const entries = Object.entries(state.inventory).filter(([,data]) => data.count > 0);
      if (!entries.length) {
        el.innerHTML = `<div class="section-head"><div><div class="pixel-kicker">STORAGE</div><h3>Inventory</h3></div></div><p class="small">No catches stored.</p>`;
        return;
      }
      el.innerHTML = `<div class="section-head"><div><div class="pixel-kicker">STORAGE</div><h3>Inventory</h3></div></div>` + entries.map(([key,data]) => {
        const total = data.count * data.unitValue;
        const sprite = getFishSprite(data.displayName, 'Common', /mutation/i.test(data.mutation||'') && /skele|phantom/.test((data.mutation||'').toLowerCase()) );
        return `<div class="inventory-row inventory-card"><img src="${sprite}" alt="${data.displayName}"><div class="inventory-details"><strong>${data.displayName}</strong><div class="small">${data.count} × ${formatMoney(data.unitValue)}${data.mutation ? ` · ${data.mutation}` : ""}</div></div><button class="pixel-button" onclick="sellInventoryKey('${encodeURIComponent(key)}')">Sell ${formatMoney(total)}</button></div>`;
      }).join("");
    }

    function buyRod(id) {
      const rod = rods.find(r => r.id === id);
      if (!rod || state.owned.includes(id) || !requirementMet(rod) || (rod.shopLocation && rod.shopLocation !== state.location) || (rod.shoreOnly && state.location !== "shark") || state.money < rod.price) return;
      state.money -= rod.price;
      state.owned.push(id);
      if (id === "snowflake") {
        state.snowflakeIntegrity = 100;
        state.snowflakeCatches = 0;
      }
      state.equipped = id;
      addLog(`Purchased and equipped ${rod.name}.`, "success");
      render();
    }

    function equipRod(id) {
      if (!state.owned.includes(id)) return;
      const rod=rods.find(r=>r.id===id);
      if (rod?.unavailable) { addLog(`${rod.name} is temporarily unavailable until the Rainbow Pond expansion.`,"warning"); return; }
      if (rod?.shoreOnly && state.location !== "shark") { addLog(`${rod.name} can only be equipped at Shark Shores.`,"warning"); return; }
      state.equipped = id;
      addLog(`Equipped ${currentRod().name}.`);
      const bagModal = document.getElementById("rodBagModal"); if (bagModal) bagModal.classList.remove("active");
      render();
    }

    function maybeStartSharkEvents() {
      if (state.location !== "shark") return;
      if (!eventActive("sharkMigrationUntil") && Math.random() < .03) {
        state.sharkMigrationUntil = Date.now() + 20 * 60 * 1000;
        addLog("Shark Migration began! All shark species are catchable for 20 minutes.", "warning");
      }
      if (!eventActive("whaleAbundanceUntil") && Math.random() < .03) {
        state.whaleAbundanceUntil = Date.now() + 15 * 60 * 1000;
        state.whaleMigrationBlueWhales = 0;
        addLog("Whale Migration began! It ends after 1 Moby or 5 Blue Whales.", "warning");
      }
    }

    function getAvailablePool() {
      const rod=currentRod(), period=getPeriod(), weather=currentWeatherName();
      let source;
      if(weather==="Tsunami") source=allFishPool();
      else if(weather==="Flood") source=eventBestiaries.flood;
      else if(weather==="Acid Rain") source=eventBestiaries.acid;
      else if(weather==="Drought") source=eventBestiaries.drought;
      else if(weather==="Eclipse") source=[...locations[state.location].fish,...eventBestiaries.eclipse];
      else source=locations[state.location].fish;

      let pool=source.filter(f=>{
        const c=f[4];
        if(c==="day"||c==="dayOptional") return period==="day";
        if(c==="night") return period==="night";
        if(c==="lunar"||c==="moby"||c==="elderKelpie"||c==="reefTitan") return false;
        if(c==="coral"&&!rod.canCoral) return false;
        if(c==="whale") return eventActive("whaleAbundanceUntil");
        if(c==="migration"||c==="migrationRequired") return eventActive("sharkMigrationUntil");
        if(state.location==="shark"&&isSharkFish(f[0])&&!eventActive("sharkMigrationUntil")) return false;
        return true;
      });
      if(rod.id==="electromagnetic") pool=pool.filter(f=>f[3]===true);
      return pool;
    }

    function chooseFish() {
      maybeStartSharkEvents();
      const rod=currentRod(), stats=effectiveStats(rod), period=getPeriod();
      let pool=getAvailablePool();
      if(!pool.length){ addLog("Nothing can be hooked under the current conditions.","warning"); return null; }
      const lunarEligible=state.location==="aurora"&&period==="night"&&rod.id!=="electromagnetic";
      if(lunarEligible&&Math.random()<.10) return {fish:locations.aurora.fish.find(f=>f[0]==="Lunar Lurker"),chance:10};
      if(currentWeatherName()==="Flood"&&Math.random()<.10){
        const elder=eventBestiaries.flood.find(f=>f[0]==="Elder Kelpie");
        if(elder)return {fish:elder,chance:10};
      }
      const luckFactor=Math.max(-100,stats.luck);
      const weighted=pool.map(f=>{const rank=rarityOrder.indexOf(f[1]);const base=rarityWeights[f[1]];const boost=Math.pow(1+Math.max(0,luckFactor)/120,rank*.72);const penalty=luckFactor<0?Math.pow(.92,rank*Math.abs(luckFactor)/5):1;return {f,weight:base*boost*penalty};});
      const total=weighted.reduce((a,x)=>a+x.weight,0);let roll=Math.random()*total,selected=weighted[0];
      for(const x of weighted){roll-=x.weight;if(roll<=0){selected=x;break;}}
      const selectedChance=(selected.weight/total)*100*(lunarEligible?.9:1);
      if(selected.f[0]==="Blue Whale"&&Math.random()<.10) return {fish:locations.shark.fish.find(f=>f[0]==="Moby"),chance:selectedChance*.10};
      if(selected.f[0]==="Reef Titan"&&Math.random()<.10) return {fish:locations.grandreef.fish.find(f=>f[0]==="Grand Reef Titan"),chance:selectedChance*.10};
      return {fish:selected.f,chance:selectedChance};
    }

    function castLine() {
      if (activeMini) return;
      if(currentWeatherName()==="Drought" && !currentRod().superlure){
        addLog("Drought prevents normal fishing. Equip a rod with Superlure.","warning");
        return;
      }
      const rod = currentRod();
      const stats = effectiveStats(rod);
      const waitSeconds = Math.max(0, (100 - stats.haste) * .075);
      const fishButton = document.getElementById("fishButton");
      const castEta = document.getElementById("castEtaLabel");
      fishButton.disabled = true;
      fishButton.textContent = waitSeconds <= 0 ? "Instant bite!" : `Waiting... ${waitSeconds.toFixed(2)}s`;
      if (castEta) castEta.textContent = waitSeconds <= 0 ? 'Lure ETA: instant bite' : `Lure ETA: ${waitSeconds.toFixed(2)}s`;
      setTimeout(() => {
        fishButton.disabled = false;
        fishButton.textContent = `Cast with ${currentRod().name}`;
        renderFishingPanel();
        const encounter = chooseFish();
        if(!encounter){ fishButton.disabled=false; fishButton.textContent=`Cast with ${currentRod().name}`; renderFishingPanel(); return; }
        if (currentRod().id === "megaLoad") state.megaLuckStacks = 0;
        if (currentRod().id === "bonetrapper" && Math.random() < .20) {
          processCatch(encounter.fish, {completed:true, fallback:false, perfect:true, encounterChance:encounter.chance, trapped:true});
        } else startMinigame(encounter.fish, encounter.chance);
      }, waitSeconds * 1000);
    }

    function startMinigame(fish, encounterChance) {
      const rod = currentRod();
      activeMini = {
        fish,
        encounterChance,
        total:shakeCounts[fish[1]] + (rod.id === "harpoon" && isSharkFish(fish[0]) ? 10 : 0),
        spawned:0,
        hits: currentRod().id==="coralguard"?6.6:0,
        misses:0,
        coralCounter:0,
        durationBonus:0,
        ended:false,
        timers:[]
      };

      document.getElementById("miniFish").textContent = `${fish[1]} bite — ${fish[0]}`;
      document.getElementById("catchProgress").style.width = `${Math.min(100,activeMini.hits*5)}%`;
      document.getElementById("miniInfo").textContent = `Hits: ${Math.floor(activeMini.hits)}/20 · Opportunities: ${activeMini.total}`;
      const box = document.getElementById("minigameBox");
      box.dataset.location = state.location;
      box.dataset.period = getPeriod();
      box.dataset.weather = slugify(currentWeatherName());
      buildMiniDecor(fish);
      document.getElementById("minigameModal").classList.add("active");

      const interval = Math.max(260, 650 - Math.min(250, effectiveStats(rod).haste));
      spawnShake();
      const timer = setInterval(() => {
        if (!activeMini || activeMini.ended) return clearInterval(timer);
        if (activeMini.spawned >= activeMini.total || activeMini.hits >= 20) {
          clearInterval(timer);
          const finalWait = 1600 + Math.max(0,effectiveStats().steady)*60*currentWeather().life + (rod.id === "harpoon" && isSharkFish(fish[0]) ? 1000 : 0);
          const finishTimer = setTimeout(finishMinigame, finalWait);
          activeMini.timers.push(finishTimer);
          return;
        }
        spawnShake();
      }, interval);
      activeMini.timers.push(timer);

      if(rod.id==="sunslasher"){
        const slashTimer=setInterval(()=>{
          if(!activeMini||activeMini.ended)return clearInterval(slashTimer);
          if(Math.random()<.20){
            activeMini.hits=Math.min(20,activeMini.hits+4);
            document.getElementById("catchProgress").style.width=`${Math.min(100,activeMini.hits*5)}%`;
            document.querySelectorAll(".shake-target").forEach(x=>x.classList.add("still"));
            setTimeout(()=>document.querySelectorAll(".shake-target").forEach(x=>x.classList.remove("still")),2000);
            if(activeMini.hits>=20)finishMinigame();
          }
        },3000);
        activeMini.timers.push(slashTimer);
      }
    }

    function spawnShake() {
      if (!activeMini || activeMini.ended || activeMini.spawned >= activeMini.total) return;
      activeMini.spawned++;
      const box = document.getElementById("minigameBox");
      const btn = document.createElement("button");
      btn.className = "shake-target";
      btn.setAttribute("aria-label","Catch target");
      const maxX = Math.max(20, box.clientWidth - 82);
      const maxY = Math.max(90, box.clientHeight - 82);
      btn.style.left = `${20 + Math.random() * (maxX - 20)}px`;
      btn.style.top = `${82 + Math.random() * (maxY - 82)}px`;

      let life = 1280 + Math.max(0, effectiveStats().steady) * 60;
      life *= currentWeather().life;
      if (currentRod().id === "harpoon" && isSharkFish(activeMini.fish[0])) life += 1000;
      if (activeMini.slowShakes > 0) { life *= 1.66; activeMini.slowShakes--; }

      activeMini.coralCounter = (activeMini.coralCounter || 0) + 1;
      const isCoralShake = currentRod().id === "coral" && activeMini.coralCounter % 3 === 0;
      if (isCoralShake) {
        btn.classList.add("still", "coral-shake");
        btn.textContent = "CORAL";
      }

      if (currentRod().id === "fishkeeper") life *= 1 + Math.min(0.30, activeMini.durationBonus || 0);
      if (currentRod().id === "gravidoomer" && Math.random() < .40) { btn.classList.add("still"); life += 2000; }

      let clicked = false;
      btn.onclick = () => {
        if (clicked || !activeMini || activeMini.ended) return;
        clicked = true;
        let gainHits=isCoralShake?4:1;
        if(currentRod().id==="coralguard"&&Math.random()<.40)gainHits*=3;
        activeMini.hits+=gainHits;
        btn.remove();
        const pct = Math.min(100, activeMini.hits * 5);
        document.getElementById("catchProgress").style.width = `${pct}%`;
        document.getElementById("miniInfo").textContent = `Hits: ${Math.floor(activeMini.hits)}/20 · Opportunities: ${Math.max(0, activeMini.total - activeMini.spawned)}`;
        if (activeMini.hits >= 20) finishMinigame();
      };

      box.appendChild(btn);
      const timeout = setTimeout(() => {
        if (!clicked && activeMini && !activeMini.ended) {
          activeMini.misses++;
          if (isCoralShake) {
            activeMini.hits = Math.max(0, activeMini.hits - 4);
            document.getElementById("catchProgress").style.width = `${Math.min(100, activeMini.hits * 5)}%`;
          }
          if (currentRod().id === "fishkeeper") activeMini.durationBonus = Math.min(0.30, (activeMini.durationBonus || 0) + 0.05);
          if (currentRod().id === "megaLoad") state.megaLuckStacks = (state.megaLuckStacks || 0) + 1;
          if (currentRod().id === "anglersEye" && Math.random() < .20) {
            activeMini.hits = Math.min(20, activeMini.hits + 1.76);
            activeMini.slowShakes = (activeMini.slowShakes || 0) + 2;
            document.getElementById("catchProgress").style.width = `${Math.min(100,activeMini.hits*5)}%`;
            if (activeMini.hits >= 20) finishMinigame();
          }
        }
        btn.remove();
      }, life);
      activeMini.timers.push(timeout);
    }

    function finishMinigame() {
      if (!activeMini || activeMini.ended) return;
      activeMini.ended = true;
      activeMini.timers.forEach(t => clearTimeout(t));
      document.querySelectorAll(".shake-target").forEach(x => x.remove());

      const mini = activeMini;
      const rod = currentRod();
      const stats = effectiveStats(rod);
      const completed = mini.hits >= 20;
      const fallback = false;
      const caught = completed;
      const perfect = completed && mini.misses === 0;

      document.getElementById("minigameModal").classList.remove("active");
      activeMini = null;

      if (caught) {
        processCatch(mini.fish, {completed, fallback, perfect, encounterChance:mini.encounterChance});
      } else {
        showResult("The fish escaped", `You reached ${Math.min(100,mini.hits * 5).toFixed(0)}% progress. This encounter had a ${mini.encounterChance.toFixed(2)}% catch-roll chance.`);
        addLog(`${mini.fish[0]} escaped at ${mini.hits * 5}% progress.`, "danger");
        afterCatchAttempt();
      }
    }

    function rollNaturalMutation() {
      const period = getPeriod();
      let roll = Math.random();
      let cumulative = 0;
      const chanceBoost = currentRod().id === "megaLoad" ? 1.15 : 1;
      for (const mutation of naturalMutations) {
        if (mutation.nightOnly && period !== "night") continue;
        cumulative += mutation.chance * chanceBoost;
        if (roll < cumulative) return mutation;
      }
      return null;
    }

    function processCatch(fish, result) {
      const [name, rarity, basePrice] = fish;
      const rod = currentRod();
      let mutation = null;
      let multiplier = 1;
      let extraCopies = 0;
      let extraMutation = null;
      let extraMultiplier = 1;

      const weatherName = state.weather || "Clear";
      const weather = currentWeather();
      if (weatherName === "Starstorm" && Math.random() < .40) { mutation="Lunar Mutation"; multiplier=2.22; }
      else if (weatherName === "Rainbow" && Math.random() < .05) {
        if (Math.random() < .5) { mutation="Glowing Mutation"; multiplier=1.9; }
        else { mutation="Rainbow Mutation"; multiplier=2.6; }
      }
      const natural = mutation ? null : rollNaturalMutation();
      if (natural) {
        mutation = `${natural.name} Mutation`;
        multiplier = natural.multiplier;
      }

      if(weatherName==="Eclipse"&&Math.random()<.10){mutation="Evil Mutation";multiplier=2.3;}
      if(weatherName==="Acid Rain"){mutation="Acidic Mutation";multiplier=.6;}
      if(weatherName==="Starstorm"&&Math.random()<.40){mutation="Lunar Mutation";multiplier=2.22;}
      if(weatherName==="Rainbow"){
        const wr=Math.random();
        if(wr<.05){mutation="Rainbow Mutation";multiplier=2.6;}
        else if(wr<.10){mutation="Glowing Mutation";multiplier=1.9;}
      }

      if(rod.id==="coral"&&Math.random()<.10){mutation="Coral Mutation";multiplier=1.44;}
      if(rod.id==="coralguard"){mutation=result.perfect?"Sacred Mutation":"Coral Mutation";multiplier=result.perfect?4:1.44;}
      if(rod.id==="sunslasher"){
        const sr=Math.random();
        if(sr<.08){mutation="Freshfried Mutation";multiplier=4.1;}
        else if(sr<.30){mutation="Heated Mutation";multiplier=2.2;}
        else if(sr<.80){mutation="Tanned Mutation";multiplier=2;}
      }

      if (rod.id === "gravidoomer") {
        const gravRoll = Math.random();
        if (gravRoll < .098) {
          mutation = "Gravitas Mutation";
          multiplier = 3.14;
        } else if (gravRoll < .598) {
          mutation = "Gravitational Mutation";
          multiplier = 2;
        }
      }

      if (rod.id === "aurora") {
        const auroraChance = getPeriod() === "night" ? .30 : .10;
        if (Math.random() < auroraChance) {
          mutation = "Aurora Mutation";
          multiplier = 2.33;
        }
      }

      if (rod.id === "anglersEye") {
        const eyeRoll = Math.random();
        if (eyeRoll < .088) {
          mutation = "Eerie Mutation";
          multiplier = 2.22;
        } else if (eyeRoll < .31) {
          mutation = "Zenith Mutation";
          multiplier = 1.88;
        }
      }

      if (rod.id === "fortuneous" && Math.random() < .10) extraCopies++;

      if (rod.id === "bellona" && result.perfect) {
        extraCopies++;
        extraMutation = "War's Ruin Mutation";
        extraMultiplier = 2.2;
      }

      const weatherValue = weather.value || 1;
      addInventory(name, basePrice, mutation, multiplier * weatherValue, 1);
      if (extraCopies) {
        if (extraMutation) {
          addInventory(name, basePrice, extraMutation, extraMultiplier * weatherValue, 1);
          if (extraCopies > 1) addInventory(name, basePrice, mutation, multiplier * weatherValue, extraCopies - 1);
        } else {
          addInventory(name, basePrice, mutation, multiplier * weatherValue, extraCopies);
        }
      }

      state.caught[name]=(state.caught[name]||0)+1+extraCopies;
      state.eventCaught=state.eventCaught||{};
      if(Object.values(eventBestiaries).some(list=>list.some(f=>f[0]===name))){
        state.eventCaught[name]=(state.eventCaught[name]||0)+1+extraCopies;
      }
      state.lastCaughtRarity=rarity;

      if (eventActive("whaleAbundanceUntil")) {
        if (name === "Moby") {
          state.whaleAbundanceUntil = 0;
          state.whaleMigrationBlueWhales = 0;
          addLog("Whale Migration ended after Moby was caught.", "warning");
        } else if (name === "Blue Whale") {
          state.whaleMigrationBlueWhales = (state.whaleMigrationBlueWhales || 0) + 1 + extraCopies;
          if (state.whaleMigrationBlueWhales >= 5) {
            state.whaleAbundanceUntil = 0;
            state.whaleMigrationBlueWhales = 0;
            addLog("Whale Migration ended after 5 Blue Whales were caught.", "warning");
          }
        }
      }

      let mysteryCount=0;
      if (rod.id === "megaLoad") {
        mysteryCount = (Math.random() < .50 ? 1 : 0) + (Math.random() < .50 ? 1 : 0);
        const pool=getAvailablePool();
        for(let i=0;i<mysteryCount;i++){
          const mf=pool[Math.floor(Math.random()*pool.length)];
          if(mf){addInventory(mf[0],mf[2],"Mystery Companion",1.1*weatherValue,1);state.caught[mf[0]]=(state.caught[mf[0]]||0)+1;}
        }
      }
      if (state.location === "shark" && ["Mosasaurus","Helipricon","Megalodon"].includes(name)) {
        state.sharkMigrationUntil=0; addLog("Shark Migration ended after an ancient predator was caught.","warning");
      }
      let details = `${rarity} ${name} caught`;
      details += ` · Encounter chance: ${result.encounterChance.toFixed(2)}%`;
      if (result.fallback) details += " through Steadiness";
      if (mutation) details += ` with ${mutation} (${multiplier}× value)`;
      if (extraCopies) details += ` · ${extraCopies} bonus copy`;
      if (mysteryCount) details += ` · ${mysteryCount} mystery companion${mysteryCount>1?"s":""}`;
      if (result.trapped) details += " · instantly trapped";
      if (weatherValue !== 1) details += ` · ${weatherName} value bonus`;
      const finalUnitValue = Math.round(basePrice * multiplier * weatherValue);
      showCatchResult({
        name, rarity, basePrice, mutation, multiplier, weatherValue, finalUnitValue,
        item: !!fish[3], condition: fish[4] || '',
        summary: details + '.'
      });
      addLog(details + ".", "success");
      afterCatchAttempt();
    }

    function addInventory(name, basePrice, mutation, multiplier, count) {
      const key = `${name}__${mutation || "Normal"}`;
      if (!state.inventory[key]) {
        state.inventory[key] = {
          displayName:name,
          mutation:mutation,
          unitValue:Math.round(basePrice * multiplier),
          count:0
        };
      }
      state.inventory[key].count += count;
    }

    function afterCatchAttempt() {
      const rod = currentRod();

      if (rod.id === "splitbranch") {
        state.splitMode = Math.random() < .5 ? 0 : 1;
      }

      if (rod.id === "snowflake") {
        state.snowflakeCatches++;
        if (state.snowflakeCatches % 6 === 0) {
          state.snowflakeIntegrity = Math.max(0, state.snowflakeIntegrity - 1);
          addLog(`Snowflake Rod integrity fell to ${state.snowflakeIntegrity}%.`, "warning");
        }
        if (state.snowflakeIntegrity <= 0) {
          state.owned = state.owned.filter(id => id !== "snowflake");
          state.equipped = "twig";
          state.snowflakeCatches = 0;
          state.snowflakeIntegrity = 100;
          addLog("The Snowflake Rod dematerialized. Twig Rod equipped.", "danger");
        }
      }

      render();
    }

    function sellInventoryKey(encoded) {
      const key = decodeURIComponent(encoded);
      const data = state.inventory[key];
      if (!data || data.count <= 0) return;
      const value = data.count * data.unitValue;
      state.money += value;
      delete state.inventory[key];
      addLog(`Sold catch stack for ${formatMoney(value)}.`, "success");
      render();
    }

    function sellAll() {
      let total = 0;
      for (const data of Object.values(state.inventory)) total += data.count * data.unitValue;
      if (!total) {
        addLog("There is nothing to sell.", "warning");
        return;
      }
      state.money += total;
      state.inventory = {};
      addLog(`Sold all catches for ${formatMoney(total)}.`, "success");
      render();
    }

    function switchLocation(){
      const unlocked=["gravitas"];
      if(isAuroraUnlocked())unlocked.push("aurora");
      if(isLocationUnlocked("shark"))unlocked.push("shark");
      if(isGrandReefUnlocked())unlocked.push("grandreef");
      if(unlocked.length<=1)return;
      const idx=unlocked.indexOf(state.location);
      state.location=unlocked[(idx+1)%unlocked.length];
      addLog(`Travelled to ${locations[state.location].name}.`);
      render();
    }

    function buySunMask(){if(state.money<SUN_MASK_PRICE)return;state.money-=SUN_MASK_PRICE;state.sunMasks=(state.sunMasks||0)+1;addLog("Purchased a Sunstone.","success");render();}
    function useSunMask(){if(!(state.sunMasks>0))return;state.sunMasks--;state.cycleStart-=PERIOD_MS;state.weatherStart=Date.now()-WEATHER_MS;updateWeatherState(true);addLog("Used a Sunstone and skipped the current period.","success");render();}

    function redeemCode() {
      const input = document.getElementById("codeInput");
      const message = document.getElementById("codeMessage");
      const code = input.value.trim().toUpperCase();
      if (!code) {
        message.textContent = "Enter a code first.";
        return;
      }
      state.redeemedCodes = state.redeemedCodes || [];
      if (state.redeemedCodes.includes(code)) {
        message.textContent = "That code has already been redeemed on this save file.";
        return;
      }

      if (code === "SECRETADMINMAX") {
        for (const loc of Object.values(locations)) {
          for (const fish of loc.fish) {
            state.caught[fish[0]] = Math.max(1, state.caught[fish[0]] || 0);
          }
        }
        state.eventCaught = state.eventCaught || {};
        for (const group of Object.values(eventBestiaries)) {
          for (const fish of group) {
            state.eventCaught[fish[0]] = Math.max(1, state.eventCaught[fish[0]] || 0);
            state.caught[fish[0]] = Math.max(1, state.caught[fish[0]] || 0);
          }
        }
        state.money += 1000000;
        state.redeemedCodes.push(code);
        message.textContent = "SECRETADMINMAX redeemed: complete-complete bestiary and $1,000,000!";
        addLog("SECRETADMINMAX completed every location and weather bestiary and granted $1,000,000.", "success");
      } else if (code === "LMAO") {
        state.luckBoostUntil = Math.max(Date.now(), state.luckBoostUntil || 0) + 20 * 60 * 1000;
        state.redeemedCodes.push(code);
        message.textContent = "LMAO redeemed: 2× Luck for 20 minutes!";
        addLog("LMAO activated 2× Luck for 20 minutes.", "success");
      } else {
        message.textContent = "Invalid code.";
        return;
      }

      input.value = "";
      saveState();
      render();
    }

    function renderCodeEffects() {
      const el = document.getElementById("codeEffects");
      if (!el) return;
      const remaining = Math.max(0, (state.luckBoostUntil || 0) - Date.now());
      if (remaining > 0) {
        const min = Math.floor(remaining / 60000);
        const sec = Math.floor((remaining % 60000) / 1000);
        el.textContent = `2× Luck — ${min}:${String(sec).padStart(2,"0")} remaining`;
      } else {
        el.textContent = "None";
      }
    }

    function updateClock() {
      const ms = getTimeRemaining();
      const min = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      document.getElementById("periodTimer").textContent = `${min}:${String(sec).padStart(2,"0")}`;
      const period = getPeriod();
      document.getElementById("periodIcon").textContent = period === "day" ? "☀" : "☾";
      document.getElementById("periodLabel").textContent = period === "day" ? "Day" : "Night";
      updateWeatherState();
      document.getElementById("weatherLabel").textContent = state.weather || "Clear";
      const wr=getWeatherRemaining(), wm=Math.floor(wr/60000), ws=Math.floor((wr%60000)/1000);
      document.getElementById("weatherTimer").textContent=`${wm}:${String(ws).padStart(2,"0")}`;
      document.getElementById("eventLabel").textContent=currentEventSummary();
      applySceneTheme();
      renderFishingPanel();
    }

    document.getElementById("fishButton").addEventListener("click", castLine);
    document.getElementById("switchLocationBtn").addEventListener("click", switchLocation);
    document.getElementById("sellAllBtn").addEventListener("click", sellAll);
    document.getElementById("buySunMaskBtn").addEventListener("click", buySunMask);
    document.getElementById("useSunMaskBtn").addEventListener("click", useSunMask);
    document.getElementById("redeemCodeBtn").addEventListener("click", redeemCode);
    document.getElementById("codeInput").addEventListener("keydown", event => {
      if (event.key === "Enter") redeemCode();
    });
    document.getElementById("resultClose").addEventListener("click", () => document.getElementById("resultModal").classList.remove("active"));
    document.getElementById("resetBtn").addEventListener("click", () => {
      if (!confirm("Delete all money, rods, catches, and bestiary progress?")) return;
      localStorage.removeItem(SAVE_KEY);
      state = freshState();
      activeScreen = 'fishing';
      render();
    });
    const launchModal = document.getElementById('launchpadModal');
    document.getElementById('launchButton').addEventListener('click', () => launchModal.classList.add('active'));
    document.getElementById('closeLaunchpadBtn').addEventListener('click', () => launchModal.classList.remove('active'));
    launchModal.addEventListener('click', e => { if (e.target === launchModal) launchModal.classList.remove('active'); });
    document.querySelectorAll('.launch-app').forEach(btn => btn.addEventListener('click', () => setScreen(btn.dataset.screen)));

    const bagModal = document.getElementById('rodBagModal');
    const openBag = () => { renderRodBag(); bagModal.classList.add('active'); };
    document.getElementById('openRodBagBtn').addEventListener('click', openBag);
    document.getElementById('openRodBagBtn2').addEventListener('click', openBag);
    document.getElementById('closeRodBagBtn').addEventListener('click', () => bagModal.classList.remove('active'));
    bagModal.addEventListener('click', e => { if (e.target === bagModal) bagModal.classList.remove('active'); });

    window.buyRod = buyRod;
    window.equipRod = equipRod;
    window.sellInventoryKey = sellInventoryKey;

    window.addEventListener("error",event=>{
      const box=document.getElementById("fatalError");
      if(box){box.style.display="block";box.textContent=`Game error: ${event.message}
Line ${event.lineno}:${event.colno}`;}
    });
    window.addEventListener("unhandledrejection",event=>{
      const box=document.getElementById("fatalError");
      if(box){box.style.display="block";box.textContent=`Game error: ${event.reason}`;}
    });
    try { render(); } catch(error) {
      const box=document.getElementById("fatalError");
      if(box){box.style.display="block";box.textContent=`Game failed to start: ${error.message}`;}
      console.error(error);
    }
    clockTimer = setInterval(() => {
      try {
      const previous = document.getElementById("periodLabel").textContent.toLowerCase();
      updateClock();
      renderCodeEffects();
      if(previous!==getPeriod()) render();
      } catch(error) { console.error(error); }
    }, 1000);
