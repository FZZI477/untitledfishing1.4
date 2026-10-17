// Time and weather configuration

const PERIOD_MS = 10 * 60 * 1000;

const WEATHER_MS = 5 * 60 * 1000;

const SUN_MASK_PRICE = 300;

const locationOrder = ["gravitas", "aurora", "shark", "grandreef"];

const weatherData = {
      Clear:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      Rainy:{haste:-7.5,luckMult:1,luckAdd:10,life:1,value:1},
      Windy:{haste:5,luckMult:1,luckAdd:0,life:1,value:1},
      Stormy:{haste:30,luckMult:1,luckAdd:-10,life:.9,value:1},
      Sunny:{haste:0,luckMult:1,luckAdd:0,life:1.1,value:1},
      Rainbow:{haste:0,luckMult:3,luckAdd:0,life:1,value:1.2},
      Starstorm:{haste:0,luckMult:2,luckAdd:0,life:1,value:1.33},
      Eclipse:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      "Acid Rain":{haste:0,luckMult:1,luckAdd:50,steadyAdd:-30,life:1,value:1},
      Drought:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      Flood:{haste:0,luckMult:1,luckAdd:0,life:1,value:1},
      Tsunami:{haste:0,luckMult:1,luckAdd:0,life:1,value:1}
    };

// October 2026 weather / Sunstone balance patch.
window.addEventListener("DOMContentLoaded", () => {
      const NORMAL_WEATHERS = ["Clear","Clear","Rainy","Windy","Stormy","Sunny"];

      // Each rare weather rolls independently. If multiple rare weathers roll
      // together, the rarer one overlaps the more common one. Equal-rarity ties
      // favor the newer/later roll.
      function chooseUpdatedWeather(period, allowRainbow) {
        const candidates = [];
        const pushIf = (name, chance, label=name) => {
          if (Math.random() < chance) candidates.push({name, chance, label});
        };

        pushIf("Flood", .05);
        pushIf("Drought", .0075);
        pushIf("Acid Rain", .025);

        if (period === "day") {
          pushIf("Eclipse", .03);
          if (allowRainbow) pushIf("Rainbow", .01);
        } else {
          pushIf("Starstorm", .033);
          // Lunar is the night-only Eclipse roll. Internally it remains Eclipse
          // so existing Eclipse bestiary/mutation mechanics stay compatible.
          pushIf("Eclipse", .005, "Lunar Eclipse");
        }

        if (!candidates.length) {
          const name = NORMAL_WEATHERS[Math.floor(Math.random() * NORMAL_WEATHERS.length)];
          return {name, label:name, chance:1};
        }

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

        const allowRainbow = period === "day" && state.previousPeriod === "night" && state.lastPeriodWeather === "Rainy";
        const rolled = chooseUpdatedWeather(period, allowRainbow);
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

      // Drought no longer blocks rods without Superlure. Instead, ordinary rods
      // operate at 25% of their base Luck/Haste/Steadiness and have all rod
      // passives disabled for as long as Drought is active.
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
          // This bypasses the old hard Drought gate in castLine. The fake flag
          // is only on this temporary clone; the real rod does NOT gain Superlure.
          superlure:true,
          canCoral:false,
          passive:"Passive disabled by Drought (no Superlure)."
        };
      };

      const originalWeatherSummary = weatherSummary;
      weatherSummary = function(name) {
        if (name === "Drought") return "All rods can fish. Rods without Superlure have -75% Luck, Haste, and Steadiness, and their passive abilities are disabled.";
        return originalWeatherSummary(name);
      };

      // Updated player-facing event name while preserving the old save key.
      currentEventSummary = function() {
        const events = [];
        if (eventActive("sharkMigrationUntil")) events.push("Shark Migration");
        if (eventActive("whaleAbundanceUntil")) events.push("Whale Migration");
        return events.length ? events.join(" + ") : "No Event";
      };

      function renameWhaleLabels(root=document) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          if (node.nodeValue && node.nodeValue.includes("Whale Abundance")) {
            node.nodeValue = node.nodeValue.replaceAll("Whale Abundance", "Whale Migration");
          }
        }
      }

      if (typeof renderBestiary === "function") {
        const originalRenderBestiary = renderBestiary;
        renderBestiary = function() {
          originalRenderBestiary();
          const bestiary = document.getElementById("bestiary");
          if (bestiary) renameWhaleLabels(bestiary);
        };
      }

      function rollSunstoneEvents() {
        const now = Date.now();
        const started = [];

        // Independent 3.3% rolls: both can coexist. Re-rolling an event refreshes
        // it, so the newer occurrence overlaps/replaces the older timer.
        if (Math.random() < .033) {
          const wasActive = eventActive("sharkMigrationUntil");
          state.sharkMigrationUntil = now + 20 * 60 * 1000;
          started.push(wasActive ? "Shark Migration refreshed" : "Shark Migration began");
        }

        if (Math.random() < .033) {
          const wasActive = eventActive("whaleAbundanceUntil");
          state.whaleAbundanceUntil = now + 15 * 60 * 1000;
          started.push(wasActive ? "Whale Migration refreshed" : "Whale Migration began");
        }

        for (const message of started) addLog(`${message} from the Sunstone!`, "warning");
      }

      useSunMask = function() {
        if (!(state.sunMasks > 0)) return;

        state.sunMasks--;
        state.cycleStart -= PERIOD_MS;
        state.weatherStart = Date.now() - WEATHER_MS;
        updateWeatherState(true);
        rollSunstoneEvents();

        addLog("Used a Sunstone: skipped the current period and rerolled weather/events.", "success");
        render();
        renameWhaleLabels(document);
      };

      // Remove the original game.js Sunstone click listener so one use cannot
      // consume two Sunstones or perform two weather rolls.
      const oldUseButton = document.getElementById("useSunMaskBtn");
      if (oldUseButton) {
        const replacement = oldUseButton.cloneNode(true);
        oldUseButton.replaceWith(replacement);
        replacement.addEventListener("click", useSunMask);
      }

      render();
      renameWhaleLabels(document);
    });
