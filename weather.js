// Time and weather configuration

const PERIOD_MS = 10 * 60 * 1000;
const WEATHER_MS = 5 * 60 * 1000;
const SUN_MASK_PRICE = 300;
const SUNSTONE_COOLDOWN_MS = 3 * 60 * 1000;
const SEASON_MS = 60 * 60 * 1000;

const locationOrder = ["gravitas", "aurora", "shark", "grandreef", "rainbow"];

const weatherData = {
      Clear:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      Rainy:{haste:-7.5,luckMult:1,luckAdd:10,life:1,value:1},
      Windy:{haste:5,luckMult:1,luckAdd:0,life:1,value:1},
      Stormy:{haste:30,luckMult:1,luckAdd:-10,life:.9,value:1},
      Sunny:{haste:0,luckMult:1,luckAdd:0,life:1.1,value:1},
      Rainbow:{haste:0,luckMult:3,luckAdd:0,life:1,value:1.2},
      Starstorm:{haste:0,luckMult:2,luckAdd:0,life:1,value:1.33},
      Aurora:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      Eclipse:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      "Acid Rain":{haste:0,luckMult:1,luckAdd:50,steadyAdd:-30,life:1,value:1},
      Drought:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      Flood:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      Tsunami:{haste:0,luckMult:1,luckAdd:0,life:1,value:1}
    };

window.addEventListener("DOMContentLoaded", () => {
      const NORMAL_WEATHERS = ["Clear","Clear","Rainy","Windy","Stormy","Sunny"];

      function chooseBalancedWeather(period) {
        const candidates = [];
        const pushIf = (name, chance, label=name) => {
          if (Math.random() < chance) candidates.push({name, chance, label});
        };

        // Day + night
        pushIf("Flood", .03);
        pushIf("Drought", .02);
        pushIf("Acid Rain", .025);

        if (period === "day") {
          pushIf("Eclipse", .01);
          pushIf("Rainbow", .01);
        } else {
          pushIf("Aurora", .02);
          pushIf("Starstorm", .0075);
          // Lunar Eclipse keeps its previous 0.5% night-only roll.
          pushIf("Eclipse", .005, "Lunar Eclipse");
        }

        if (!candidates.length) {
          const name = NORMAL_WEATHERS[Math.floor(Math.random() * NORMAL_WEATHERS.length)];
          return {name, label:name, chance:1};
        }

        // Rarer weather overlaps more common weather. Equal-rarity ties favor
        // the newer/later candidate.
        let winner = candidates[0];
        for (const candidate of candidates.slice(1)) {
          if (candidate.chance <= winner.chance) winner = candidate;
        }
        return winner;
      }

      updateWeatherState = function(force=false) {
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

        const rolled = chooseBalancedWeather(period);
        state.weather = rolled.name;
        state.currentWeather = rolled.name;
        if (rolled.name !== oldWeather) addLog(`Weather changed to ${rolled.label}.`, "warning");
      };

      currentWeather = function() {
        updateWeatherState();
        return weatherData[state.weather] || weatherData.Clear;
      };

      currentWeatherName = function() {
        return state.weather || state.currentWeather || "Clear";
      };

      // Drought: non-Superlure rods can fish, but operate at 25% stats and lose
      // their passive. The temporary ID disables all ID-based passive logic.
      const originalCurrentRod = currentRod;
      currentRod = function() {
        const rod = originalCurrentRod();
        if (!rod || state.weather !== "Drought" || rod.superlure) return rod;
        return {
          ...rod,
          id:`drought-disabled-${rod.id}`,
          haste:(rod.haste || 0) * .25,
          luck:(rod.luck || 0) * .25,
          steady:(rod.steady || 0) * .25,
          superlure:true,
          canCoral:false,
          passive:"Passive disabled by Drought (no Superlure)."
        };
      };

      const originalWeatherSummary = weatherSummary;
      weatherSummary = function(name) {
        if (name === "Drought") return "All rods can fish. Rods without Superlure have -75% Luck, Haste, and Steadiness, and lose their passive.";
        if (name === "Aurora") return "Rare aurora skies. No direct stat modifier.";
        return originalWeatherSummary(name);
      };

      currentEventSummary = function() {
        const events = [];
        if (eventActive("sharkMigrationUntil")) events.push("Shark Migration");
        if (eventActive("whaleAbundanceUntil")) events.push("Whale Migration");
        return events.length ? events.join(" + ") : "No Event";
      };

      function currentSunstonePrice() {
        const tier = Math.max(0, locationOrder.indexOf(state.location));
        return SUN_MASK_PRICE + tier * 100;
      }

      function updateSunstoneUI() {
        const price = currentSunstonePrice();
        const buy = document.getElementById("buySunMaskBtn");
        const use = document.getElementById("useSunMaskBtn");
        const count = document.getElementById("sunMaskCount");
        const remaining = Math.max(0, (state.sunstoneCooldownUntil || 0) - Date.now());

        if (buy) {
          buy.textContent = `Buy $${price.toLocaleString()}`;
          buy.disabled = state.money < price;
        }
        if (count) count.textContent = `Owned: ${state.sunMasks || 0} · Area price $${price.toLocaleString()}`;

        if (use) {
          if (remaining > 0) {
            const min = Math.floor(remaining / 60000);
            const sec = Math.floor((remaining % 60000) / 1000);
            use.textContent = `Use Sunstone (${min}:${String(sec).padStart(2,"0")})`;
            use.disabled = true;
          } else {
            use.textContent = "Use Sunstone";
            use.disabled = !(state.sunMasks > 0);
          }
        }
      }

      function rollSunstoneEvents() {
        const now = Date.now();
        if (Math.random() < .03) {
          state.sharkMigrationUntil = now + 20 * 60 * 1000;
          addLog("Shark Migration spawned/refreshed from the Sunstone!", "warning");
        }
        if (Math.random() < .03) {
          const wasActive = eventActive("whaleAbundanceUntil");
          state.whaleAbundanceUntil = now + 15 * 60 * 1000;
          if (!wasActive) state.whaleMigrationBlueWhales = 0;
          addLog("Whale Migration spawned/refreshed from the Sunstone!", "warning");
        }
      }

      buySunMask = function() {
        const price = currentSunstonePrice();
        if (state.money < price) return;
        state.money -= price;
        state.sunMasks = (state.sunMasks || 0) + 1;
        addLog(`Purchased a Sunstone for $${price.toLocaleString()}.`, "success");
        render();
      };

      useSunMask = function() {
        if (!(state.sunMasks > 0)) return;
        const remaining = Math.max(0, (state.sunstoneCooldownUntil || 0) - Date.now());
        if (remaining > 0) {
          addLog("Sunstone is still on cooldown.", "warning");
          updateSunstoneUI();
          return;
        }

        state.sunMasks--;
        state.sunstoneCooldownUntil = Date.now() + SUNSTONE_COOLDOWN_MS;
        state.cycleStart -= PERIOD_MS;
        state.weatherStart = Date.now() - WEATHER_MS;
        updateWeatherState(true);
        rollSunstoneEvents();

        addLog("Used a Sunstone: skipped the current period and rerolled weather/events. 3-minute cooldown started.", "success");
        render();
      };

      // The old game.js listeners captured the old functions. Replacing both
      // buttons removes those listeners before wiring the balanced handlers.
      const oldBuy = document.getElementById("buySunMaskBtn");
      if (oldBuy) {
        const replacement = oldBuy.cloneNode(true);
        oldBuy.replaceWith(replacement);
        replacement.addEventListener("click", buySunMask);
      }
      const oldUse = document.getElementById("useSunMaskBtn");
      if (oldUse) {
        const replacement = oldUse.cloneNode(true);
        oldUse.replaceWith(replacement);
        replacement.addEventListener("click", useSunMask);
      }

      const originalRender = render;
      render = function() {
        originalRender();
        updateSunstoneUI();
      };

      const originalUpdateClock = updateClock;
      updateClock = function() {
        originalUpdateClock();
        updateSunstoneUI();
      };

      render();
    });
