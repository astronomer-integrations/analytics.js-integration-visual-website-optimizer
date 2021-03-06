/* eslint-disable strict */

/**
 * Module dependencies.
 */

var each = require('component-each');
var integration = require('@segment/analytics.js-integration');
var tick = require('browser-next-tick');

var replayCache = [];
var listenCache = [];
var spaMode = false;
var findExperiments = function(experiments, type) {
  // Array of _vwo_exp_ids that we will return that have not been added to the cache
  var clean = [];
  if (spaMode) {
    // If the app is a SPA, then we need to filter the experiment ids that have already been sent

    // Loading the cache of the type of event that needs to fire, so if both listen and track are selected they can both fire the same event
    var cache = type === 'listen' ? listenCache : replayCache;


    // Function to push new id to be cached into the correct cache
    var pushIt = function(value) {
      if (type === 'replay') {
        replayCache.push(value);
      }
      if (type === 'listen') {
        listenCache.push(value);
      }
    };

    // Loop thru the active experiments and see what needs to be cached and what needs to sent to be tracked
    Object.keys(experiments).forEach(function(key) {
      if (cache.indexOf(key) === -1) {
        if (experiments[key].ready && experiments[key].combination_chosen) {
          // If the experiment is active, let's cache it's id so it doesn't fire a duplicate track event
          pushIt(key);
          // It's fine to add to the returned array this time, as it will be the first time it's fired and will be blocked next time
        }
        // Push all non-cached keys to the array we will return
        clean.push(key);
      }
    });

    // Return an array the ids of experiments not ready and those ready for the first time
  } else {
    // If the app is not a SPA, just return the ids that VWO manage
    clean = window._vwo_exp_ids;
  }
  return clean;
};

/**
 * Expose `VWO` integration.
 */

var VWO = module.exports = integration('Visual Website Optimizer')
  .global('_vis_opt_queue')
  .global('_vis_opt_revenue_conversion')
  .global('_vwo_exp')
  .global('_vwo_exp_ids')
  .option('accountId')
  .option('useAsyncSmartCode', false)
  .option('settingsTolerance', 2000)
  .option('libraryTolerance', 2500)
  .option('useExistingJQuery', false)
  .option('replay', true)
  .option('listen', false)
  .option('isSpa', false);

/**
 * The context for this integration.
 */

var integrationContext = {
  name: 'visual-website-optimizer',
  version: '1.0.0'
};

/**
 * Initialize.
 */

VWO.prototype.initialize = function() {
  if (this.options.useAsyncSmartCode) {
    /* eslint-disable */
    var account_id = this.options.accountId;
    var settings_tolerance = this.options.settingsTolerance;
    var library_tolerance = this.options.libraryTolerance;
    var use_existing_jquery = this.options.useExistingJQuery;
    var is_spa = (this.options.isSpa) ? '&f=1' : '';

    window._vwo_code=(function(){f=false,d=document;return{use_existing_jquery:function(){return use_existing_jquery;},library_tolerance:function(){return library_tolerance;},finish:function(){if(!f){f=true;var a=d.getElementById('_vis_opt_path_hides');if(a)a.parentNode.removeChild(a);}},finished:function(){return f;},load:function(a){var b=d.createElement('script');b.src=a;b.type='text/javascript';b.innerText;b.onerror=function(){_vwo_code.finish();};d.getElementsByTagName('head')[0].appendChild(b);},init:function(){settings_timer=setTimeout('_vwo_code.finish()',settings_tolerance);var a=d.createElement('style'),b='body{opacity:0 !important;filter:alpha(opacity=0) !important;background:none !important;}',h=d.getElementsByTagName('head')[0];a.setAttribute('id','_vis_opt_path_hides');a.setAttribute('type','text/css');if(a.styleSheet)a.styleSheet.cssText=b;else a.appendChild(d.createTextNode(b));h.appendChild(a);this.load('//dev.visualwebsiteoptimizer.com/j.php?a='+account_id+'&u='+encodeURIComponent(d.URL)+'&r='+Math.random()+is_spa);return settings_timer;}};}());_vwo_settings_timer=_vwo_code.init();
    /* eslint-enable */
  }
  spaMode = this.options.isSpa;

  var self = this;

  if (this.options.replay) {
    tick(function() {
      self.replay();
    });
  }

  if (this.options.listen) {
    tick(function() {
      self.roots();
    });
  }

  if (this.options.useAsyncSmartCode) {
    enqueue(function() {
      self.ready();
    });
  } else {
    self.ready();
  }
};

/**
 * Completed Purchase.
 *
 * https://vwo.com/knowledge/vwo-revenue-tracking-goal
 */

VWO.prototype.orderCompleted = function(track) {
  var total = track.total() || track.revenue() || 0;
  enqueue(function() {
    window._vis_opt_revenue_conversion(total);
  });
};

/**
 * Replay the experiments the user has seen as traits to all other integrations.
 * Wait for the next tick to replay so that the `analytics` object and all of
 * the integrations are fully initialized.
 */

VWO.prototype.replay = function() {
  var analytics = this.analytics;

  experiments(function(err, traits) {
    if (traits) analytics.identify(traits);
  });
};

/**
 * Replay the experiments the user has seen as traits to all other integrations.
 * Wait for the next tick to replay so that the `analytics` object and all of
 * the integrations are fully initialized.
 */

VWO.prototype.roots = function() {
  var analytics = this.analytics;

  rootExperiments(function(err, data) {
    each(data, function(experimentId, variationName) {
      analytics.track(
        'Experiment Viewed',
        {
          experimentId: experimentId,
          variationName: variationName
        },
        { context: { integration: integrationContext } }
      );
    });
  });
};

VWO.prototype.page = function() {
  var self = this;

  if (spaMode) {
    if (this.options.replay) {
      tick(function() {
        self.replay();
      });
    }

    if (this.options.listen) {
      tick(function() {
        self.roots();
      });
    }
  }
};

/**
 * Get dictionary of experiment keys and variations.
 *
 * http://visualwebsiteoptimizer.com/knowledge/integration-of-vwo-with-kissmetrics/
 *
 * @param {Function} fn
 * @return {Object}
 */

function rootExperiments(fn) {
  enqueue(function() {
    var data = {};
    var experimentIds = findExperiments(window._vwo_exp, 'listen');
    if (!experimentIds) return fn();
    each(experimentIds, function(experimentId) {
      var variationName = variation(experimentId);
      if (variationName) data[experimentId] = variationName;
    });
    fn(null, data);
  });
}

/**
 * Get dictionary of experiment keys and variations.
 *
 * http://visualwebsiteoptimizer.com/knowledge/integration-of-vwo-with-kissmetrics/
 *
 * @param {Function} fn
 * @return {Object}
 */

function experiments(fn) {
  enqueue(function() {
    var data = {};
    var ids = findExperiments(window._vwo_exp, 'replay');
    if (!ids) return fn();
    each(ids, function(id) {
      var name = variation(id);
      if (name) data['Experiment: ' + id] = name;
    });
    fn(null, data);
  });
}

/**
 * Add a `fn` to the VWO queue, creating one if it doesn't exist.
 *
 * @param {Function} fn
 */

function enqueue(fn) {
  window._vis_opt_queue = window._vis_opt_queue || [];
  window._vis_opt_queue.push(fn);
}

/**
 * Get the chosen variation's name from an experiment `id`.
 *
 * http://visualwebsiteoptimizer.com/knowledge/integration-of-vwo-with-kissmetrics/
 *
 * @param {String} id
 * @return {String}
 */

function variation(id) {
  var experiments = window._vwo_exp;
  if (!experiments) return null;
  var experiment = experiments[id];
  var variationId = experiment.combination_chosen;

  // Send data only if experiment is marked ready by VWO and User is not previewing the VWO campaign
  if (experiment.ready && !window._vis_debug && variationId) {
    return experiment.comb_n[variationId];
  }
  return null;
}
