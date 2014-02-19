/*jshint unused:strict, browser:true */
(function (global, module) {
  'use strict';

  if ('undefined' == typeof module) {
    module = { };
  }

  /* Mutant.js */

  function throttle(fn, threshhold, scope) {
    var last, deferTimer;

    return function () {
      var now = Date.now();
      if (last && now < last + threshhold) {
        // hold on to it
        clearTimeout(deferTimer);
        deferTimer = setTimeout(function () {
          last = now;
          fn.apply(scope);
        }, threshhold);
      } else {
        last = now;
        fn.apply(scope);
      }
    };
  }

  /**
   * A really simple and horrible MutationObserver
   */
  function LegacyMutations(callback) {
    this.callback = callback;
    this.onModifications = throttle(function() {
      this.callback([]);
    }, 5, this);
  }

  LegacyMutations.prototype = {
    observe: function(target) {
      this._target = target;
      // NB this is not a fullblow shim, just enough to get by
      // therefore options are ignored
      target.addEventListener('DOMSubtreeModified', this.onModifications, false);
    },

    disconnect: function() {
      if(!this._target) return;
      this._target.removeEventListener('DOMSubtreeModified', this.onModifications, false);
      delete this._target;
    },

    takeRecords: function() {
      var target = this._target;

      target.removeEventListener('DOMSubtreeModified', this.onModifications, false);
      target.addEventListener('DOMSubtreeModified', this.onModifications, false);
    }
  };

  /**
   * An eventhandler implementation
   */
  function EventHandler(element, callback, context) {
    this.element = element;
    this.callback = callback;
    this.context = context;
    element.addEventListener('load', this, false);
    element.addEventListener('error', this, false);
  }

  EventHandler.prototype = {
    _detach: function() {
      if(!this.element) return;

      this.element.removeEventListener('load', this, false);
      this.element.removeEventListener('error', this, false);
      this.element = null;
      this.callback = null;
      this.context = null;
    },

    handleEvent: function(e) {
      this.callback.call(this.context, e, this);
    },
  };

  var document = global.document;
  var MutationObserver = global.MutationObserver || global.MozMutationObserver || global.WebKitMutationObserver || LegacyMutations;

  var idCounter = 0;

  /**
   * Determines whether a node is an element which may change its layout
   */
  function isWatchCandidate(node) {
    var r = node.nodeType === 1 &&
            node.tagName === 'IMG' &&
            !node.complete &&
            (!node.getAttribute('width') || !node.getAttribute('height'));

    return r;
  }

  /**
   * Mutant
   */
  function Mutant(target, callback, options) {
    this._eventHandlers = {};

    var scope = options ? options.scope : null;
    var throttleTimeout = options ? options.timeout : 0;
    var self = this;

    if(throttleTimeout) {
      this._callback = throttle(function() {
        try {
          callback.apply(scope);
        } finally {
          self.takeRecords();
        }
      }, throttleTimeout);
    } else {
      this._callback = function() {
        try {
          callback.apply(scope);
        } finally {
          self.takeRecords();
        }
      };
    }

    /* Find any existing loading images in the target */
    this._findLoadingImages(target);

    this._mutationCallback = this._mutationCallback.bind(this);
    this.observer = new MutationObserver(this._mutationCallback);

    // pass in the target node, as well as the observer options
    this.observer.observe(target, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  Mutant.prototype = {
    _addListener: function(element) {
      if(element.dataset.gLoadListenerId) return;

      var id = ++idCounter;
      element.dataset.gLoadListenerId = id;

      this._eventHandlers[id] = new EventHandler(element, function(e, eventHandler) {
        eventHandler._detach();
        this._callback();
      }, this);

    },

    _removeListener: function(element) {
      var id = element.dataset.gLoadListenerId;
      if(!id) return;
      delete element.dataset.gLoadListenerId;

      var handler = this._eventHandlers[id];
      if(!handler) return;
      delete this._eventHandlers[id];

      handler._detach();
    },

    _mutationCallback: function(mutationRecords) {
      var s = this;

      mutationRecords.forEach(function(r) {
        var node;

        if(r.type === 'childList') {
          // Iterate nodeLists which don't have a .forEach
          if(r.addedNodes) {
            for(var i = 0; i < r.addedNodes.length; i++) {
              node = r.addedNodes[i];
              if(node.nodeType === 1) {
                if(node.children.length) {
                  s._findLoadingImages(node);
                } else {
                  if(isWatchCandidate(node)) {
                    s._addListener(node);
                  }
                }
              }

            }
          }

          if(r.removedNodes) {
            for(var j = 0; j < r.removedNodes.length; j++) {
              node = r.removedNodes[j];
              if(node.nodeType === 1) {
                if(node.children.length) {
                } else {
                  if(node.tagName === 'IMG') {
                    s._removeListener(node);
                  }
                }

              }

            }
          }
        }
      });

      this._callback();
    },


    _findLoadingImages: function(element) {
      var treeWalker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: function(node) {
            if(isWatchCandidate(node)) {
              return NodeFilter.FILTER_ACCEPT;
            }

            return NodeFilter.FILTER_SKIP;
          }
        },
        false
      );

      while(treeWalker.nextNode()) {
        this._addListener(treeWalker.currentNode);
      }
    },

    takeRecords: function() {
      return this.observer.takeRecords();
    },

    disconnect: function() {
      this.observer.disconnect();
      var eh = this._eventHandlers;

      Object.keys(eh).forEach(function(id) {
        var handler = eh[id];
        if(!handler) return;
        delete eh[id];

        handler._detach();
      });
    }
  };

  global.Mutant = module.exports;

  return Mutant;
})(this, module);




