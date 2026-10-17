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
// This is installed after game.js finishes loading so it can safely replace the
// old weather roller without changing the rest of the fishing code.
window.addEventListener("DOMContentLoaded", () => {
      const NORMAL_WEATHERS = ["Clear","Clear","Rainy","Windy","Stormy","Sunny"];

      // All listed chances are independent trigger rolls. If several rare
      // weathers trigger on the same roll, the rarer one wins; equal-rarity
      // ties favor the later/newer roll.
      function chooseUpdatedWeather(period, allowRainbow) {
        const candidates = [];
        const pushIf = (name, chance, label=name) => {
          if (Math.random() < chance) candidates.push({name, chance, label});
        };

        // Weather available during both day and night.
        pushIf("Flood", .05);
        pushIf("Drought", .05);
        pushIf("Acid Rain", .025);

        if (period === "day") {
          pushIf("Eclipse", .03);
          // Preserve the existing rare rainy-night -> day Rainbow roll.
          if (allowRainbow) pushIf("Rainbow", .01);
        } else {
          pushIf("Starstorm", .033);
          // Lunar is the night version of Eclipse. Keep the internal weather
          // name as Eclipse so the existing Eclipse bestiary/mutation logic works.
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

        if (rolled.name !== oldWeather) {
          const display = rolled.label === "Lunar Eclipse" ? "Lunar Eclipse" : rolled.name;
          addLog(`Weather changed to ${display}.`, "warning");
        }
      };

      currentWeather = function() {
        updateWeatherState();
        return weatherData[state.weather] || weatherData.Clear;
      };

      currentWeatherName = function() {
        return state.weather || state.currentWeather || "Clear";
      };

      function rollSunstoneEvents() {
        const now = Date.now();
        const started = [];

        // Both rolls are independent, so both events can coexist.
        if (Math.random() < .033) {
          const wasActive = eventActive("sharkMigrationUntil");
          state.sharkMigrationUntil = now + 20 * 60 * 1000;
          started.push(wasActive ? "Shark Migration refreshed" : "Shark Migration began");
        }

        if (Math.random() < .033) {
          const wasActive = eventActive("whaleAbundanceUntil");
          // Keep the existing save key for compatibility; this is the whale
          // migration/abundance event that unlocks Blue Whale and Moby.
          state.whaleAbundanceUntil = now + 15 * 60 * 1000;
          started.push(wasActive ? "Whale Migration refreshed" : "Whale Migration began");
        }

        for (const message of started) addLog(`${message} from the Sunstone!`, "warning");
        return started;
      }

      useSunMask = function() {
        if (!(state.sunMasks > 0)) return;

        state.sunMasks--;
        // Skip exactly one day/night period, then immediately reroll weather.
        state.cycleStart -= PERIOD_MS;
        state.weatherStart = Date.now() - WEATHER_MS;
        updateWeatherState(true);

        // Sunstones also roll both events independently at 3.3% each.
        rollSunstoneEvents();

        addLog("Used a Sunstone: skipped the current period and rerolled weather/events.", "success");
        render();
      };

      // game.js attached its original Sunstone click handler before this patch
      // ran. Replacing the button removes that old listener and prevents a
      // single Sunstone from being consumed twice.
      const oldUseButton = document.getElementById("useSunMaskBtn");
      if (oldUseButton) {
        const replacement = oldUseButton.cloneNode(true);
        oldUseButton.replaceWith(replacement);
        replacement.addEventListener("click", useSunMask);
      }

      // Re-evaluate once with the patched functions so the top bar and timers
      // immediately use the new system without touching the player's save.
      render();
    });
