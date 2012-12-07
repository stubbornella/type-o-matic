/*global FBL, Firebug, NodeFilter, domplate*/
FBL.ns(function() {

var EXAMPLE_TEXT_MAXCHARS = 40,
    NODETYPE_TEXT  = 3,
    BOLD_WEIGHT    = 700,

    NEAR_GRAY_THRESHOLD = 20,

    BUTTONS_ID     = 'fbTypographyButtons',
    COPY_BUTTON_ID = 'fbTypographyCopyButton',
    GENERATE_BUTTON_ID = 'fbTypographyGenerateButton',
    STYLE_ID       = 'typographyStyles',

    CONTAINER_CLASS = 'typography-report',

    RE_SKIP        = /^(?:(no)?script|style)$/,
    PANEL_NAME     = 'Typography',

    PROPERTIES = [
        'font-family',
        'font-size',
        'font-weight',
        'font-variant',
        'font-style',
        'color',
        'text-transform',
        'text-decoration',
        'text-shadow',
        'letter-spacing',
        'word-spacing'
    ],

    Cc = Components.classes,
    Ci = Components.interfaces;

//--- Utility functions

/**
 * Truncate string to the given number of characters, append an ellipsis, and
 * trim trailing and leading whitespace.
 * @param {String} s
 * @param {Integer} n
 * @return {String}
 */
function truncateString(s, n) {
    if (s.length > n) {
        s = s.substr(0, n) + '...';
    }

    return s.replace(/^\s+|\s+$/g, '');
}

/**
 * Convert RGB to HSL.
 * @param {Array} c RGB values
 * @return {Array} HSL values
 */
function rgb2hsl(c) {
    if (!c) {
        c = [255,255,255];
    }

    var r = c[0]/255,
        g = c[1]/255,
        b = c[2]/255,

        max = Math.max(r, g, b),
        min = Math.min(r, g, b),

        h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        var d = max - min;

        s = (l > 0.5) ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return [
        parseInt(h * 360, 10),
        parseInt(s * 100, 10),
        parseInt(l * 100, 10)
    ];
}

/**
 * Returns a canonical representation of a style object.
 * @param {Object} style
 * @return {String}
 */
function styleToCanonicalString(style) {
    var result = [],
        keys = FBL.keys(style).sort();

    keys.forEach(function (key) {
        result.push(key + ':' + style[key]);
    });

    return result.join(';');
}

/**
 * Is the given node considered interesting?
 * @param {HTMLElement} node
 * @return {Number}
 */
function nodeFilter(node) {
    var firstChild = node.firstChild,
        tagName    = node.tagName.toLowerCase();

    if (!tagName.match(RE_SKIP) &&
            node.textContent &&
            firstChild &&
            firstChild.nodeType === NODETYPE_TEXT &&
            firstChild.nodeValue &&
            firstChild.nodeValue.trim() !== '') {

        return NodeFilter.FILTER_ACCEPT;
    }

    // Skip nodes that don't immediately contain text to avoid picking up
    // the parent node and the child node as separate headings.
    return NodeFilter.FILTER_SKIP;
}

/**
 * Collect interesting nodes within a document.
 * @param {Document} doc
 * @return {Array}
 */
function collectNodes(doc, nodes) {
    var treeWalker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT,
            {acceptNode: nodeFilter}, false),
        node;

    while (node = treeWalker.nextNode()) {
        if (node.tagName.toLowerCase() === 'a') {
            nodes = nodes.concat(collectLink(node));
        } else {
            nodes.push(collectNode(node));
        }
    }

    return nodes;
}

/**
 * Collect a single node.
 * @param {HTMLElement} node
 * @return {Object}
 */
function collectNode(node) {
    return {
        tag  : node.tagName,
        text : truncateString(node.textContent, EXAMPLE_TEXT_MAXCHARS),
        style: getComputedStyle(node)
    };
}

/**
 * Collect a singe link node, and each of its applicable states.
 * @param {HTMLElement} node
 * @return {Array}
 */
function collectLink(node) {
    var domUtils = Cc["@mozilla.org/inspector/dom-utils;1"]
            .getService(Ci.inIDOMUtils),
        nodes = [collectNode(node, nodes)];

    if (node.tagName.toLowerCase() === 'a') {
        // <none>: 0
        // active: 1
        // focus : 2
        // hover : 4
        [1,2,4].forEach(function (state) {
            domUtils.setContentState(node, state);
            nodes.push(collectNode(node));
        });

        domUtils.setContentState(node, 0);
    }

    return nodes;
}

/**
 * Returns an object representing a node's computed style.
 * @param {HTMLElement} node
 * @return {Object}
 */
function getComputedStyle(node) {
    var computedStyle = node.ownerDocument.defaultView.getComputedStyle(node),
        style = {},
        val;

    PROPERTIES.forEach(function (prop) {
        val = computedStyle.getPropertyCSSValue(prop);

        if (val) {
            style[prop] = val.cssText;
        }
    });

    return style;
}

/**
 * Collect unique nodes within a document.
 * @param {Document} doc
 * @return {Array}
 */
function uniqueNodes(doc, nodes) {
    var unique = {};

    collectNodes(doc, nodes).forEach(function (node) {
        var key = styleToCanonicalString(node.style);

        if (!unique[key]) {
            node.count     = node.count || 1;
            node.styleText = key;

            unique[key] = node;
        } else {
            unique[key].count++;
        }
    });

    return FBL.values(unique);
}

/**
 * Sorts the given nodes by color.
 * @param {Array} nodes
 * @return {Array}
 */
function sortNodes(nodes) {
    var color  = [],
        gray   = [],
        white  = [],
        black  = [];

    nodes.forEach(function (node) {
        var rgb = node.style.color.match(/\d+/g),
            hsl = node._HSL = rgb2hsl(rgb),
            max, min;

        if (hsl[0] || hsl[1]) {
            max = Math.max(rgb[0], rgb[1], rgb[2]);
            min = Math.min(rgb[0], rgb[1], rgb[2]);

            // Near-gray colors are grouped with grays.
            if (max - min < NEAR_GRAY_THRESHOLD) {
                gray.push(node);
            } else {
                color.push(node);
            }
        } else {
            switch (hsl[2]) {
            case 100: white.push(node); break;
            case 0  : black.push(node); break;
            default : gray.push(node);  break;
            }
        }
    });

    color.sort(colorSorter);
    gray.sort(baseSorter);
    white.sort(baseSorter);
    black.sort(baseSorter);

    return white.concat(gray, black, color);
}

/**
 * Comparison function for sorting grayscale colors.
 * @param {Object} a A node object
 * @param {Object} b A node object
 * @return {Number} -1, 0, 1 for a < b, a == b, a > b
 */
function graySorter(a, b) {
    return baseSorter(a, b, b._HSL[2] - a._HSL[2]);
}

/**
 * Comparison function for sorting colors.
 * @param {Object} a A node object
 * @param {Object} b A node object
 * @return {Number} -1, 0, 1 for a < b, a == b, a > b
 */
function colorSorter(a, b) {
    var h = b._HSL[0] - a._HSL[0];

    return baseSorter(a, b, Math.abs(h) > 35 ? h : false);
}

/**
 * Base comparison function for sorting colors.
 * @param {Number} sort An existing sort condition
 * @param {Object} a A node object
 * @param {Object} b A node object
 * @return {Number} -1, 0, 1 for a < b, a == b, a > b
 */
function baseSorter(a, b, sort) {
    var aFontSize = parseInt(a.style['font-size'], 10),
        bFontSize = parseInt(b.style['font-size'], 10),
        aFontWeight = a.style['font-weight'],
        bFontWeight = b.style['font-weight'];

    aFontWeight = (aFontWeight === 'bold') ? BOLD_WEIGHT : parseInt(aFontWeight, 10);
    bFontWeight = (bFontWeight === 'bold') ? BOLD_WEIGHT : parseInt(bFontWeight, 10);

    return sort ? sort : (bFontSize - aFontSize || bFontWeight - aFontWeight);
}

//--- Firebug hooks

Firebug.TypographyModule = FBL.extend(Firebug.Module, {
    addStyleSheet: function(doc) {
        // Make sure the stylesheet isn't appended twice.
        if (FBL.$(STYLE_ID, doc)) {
            return;
        }

        var styleSheet = FBL.createStyleSheet(doc,
            'chrome://csslint/skin/csslint.css');
        styleSheet.setAttribute('id', STYLE_ID);
        FBL.addStyleSheet(doc, styleSheet);
    },

    reattachContext: function(browser, context) {
        var panel = context.getPanel(PANEL_NAME);
        this.addStyleSheet(panel.document);
    },

    togglePersist: function(context) {
        var panel = context.getPanel(PANEL_NAME);
        panel.persistContent = panel.persistContent ? false : true;

        Firebug.chrome.setGlobalAttribute('cmd_togglePersistTypography',
            'checked', panel.persistContent);
    }
});

function TypographyPanel() { }
TypographyPanel.prototype = FBL.extend(Firebug.Panel, {
    name      : PANEL_NAME,
    title     : PANEL_NAME,
    searchable: false,
    editable  : false,

    //--- Overridden panel functions

    initialize: function() {
        Firebug.Panel.initialize.apply(this, arguments);
        Firebug.TypographyModule.addStyleSheet(this.document);
    },

    show: function (state) {
        this.showToolbarButtons(BUTTONS_ID, true);
        Firebug.chrome.setGlobalAttribute('cmd_togglePersistTypography',
            'checked', this.persistContent);

        if (state && state.panelNode) {
            this._nodes    = state.panelNode._NODES || [];
            this._urlCache = state.panelNode._URL_CACHE || {};
        } else {
            this._nodes    = [];
            this._urlCache = {};
        }

        this.showButton(COPY_BUTTON_ID, this._nodes.length);
    },

    hide: function() {
        this.showToolbarButtons(BUTTONS_ID, false);
    },

    showButton: function (buttonId, show) {
        FBL.$(buttonId).style.display = show ? 'block' : 'none';
    },

    setClipboardContents: function (copytext) {
        if (!copytext || !copytext.length) {
            return false;
        }

        try {
            var str = Cc['@mozilla.org/supports-string;1']
                .createInstance(Ci.nsISupportsString);
            if (!str) { return false; }
            str.data = copytext;

            var trans = Cc['@mozilla.org/widget/transferable;1']
                  .createInstance(Ci.nsITransferable);
            if (!trans) { return false; }

            trans.addDataFlavor('text/unicode');
            trans.setTransferData('text/unicode', str, copytext.length * 2);

            var clipid = Ci.nsIClipboard;
            var clip = Cc['@mozilla.org/widget/clipboard;1'].getService(clipid);
            if (!clip) { return false; }

            clip.setData(trans, null, clipid.kGlobalClipboard);
            return true;
        }
        catch (e) {
            return false;
        }
    },

    buildJSON: function (nodes, properties) {
        // O.G. Style
        nodes = nodes.map(function (node) {
            node.style.count          = node.count;
            node.style['sample-text'] = node.text;

            return node.style;
        });

        // New Style
        // nodes = nodes.map(function (node) {
        //     delete node._HSL;
        //     return node;
        // });

        return JSON.stringify(nodes, null, 2);
    },

    notify: function (type, msg) {
        var div = this.panelNode.ownerDocument.createElement('div');
        div.className = 'notify ' + type;
        div.innerHTML = msg;

        this.panelNode.appendChild(div);

        setTimeout(function () {
            if (div.parentNode) {
                div.parentNode.removeChild(div);
            }
        }, 2500);
    },

    //--- Command entry points

    cmdClear: function () {
        this.panelNode.innerHTML  = '';
        this.panelNode._NODES     = null;
        this.panelNode._URL_CACHE = null;

        this._nodes    = [];
        this._urlCache = {};

        this.showButton(COPY_BUTTON_ID, false);
    },

    cmdExport: function () {
        if (!this._nodes.length) {
            this.notify('error', 'Nothing to copy.');
            return;
        }

        var json = this.buildJSON(this._nodes, PROPERTIES);
        this.setClipboardContents(json);
        this.notify('info', 'The report was copied to the clipboard as JSON.');
    },

    cmdReport: function() {
        var win = this.context.window,
            doc = win.document,
            nodes,
            template;

        if (this._urlCache[win.location]) {
            this.notify('error', 'Report already generated for: ' + win.location);
            return;
        } else {
            this.panelNode.innerHTML = '';
            this._urlCache[win.location] = true;
            nodes = uniqueNodes(doc, this._nodes);
        }

        template = domplate({
            index_: '',

            tag:
                FBL.DIV({ 'class': CONTAINER_CLASS },
                    FBL.TABLE(
                        //table headings
                        FBL.TR(
                            FBL.FOR('name', '$properties|getColumns',
                                FBL.TH('$name'))),
                        //loop over and write heading values
                        FBL.FOR('node', '$nodes',
                            FBL.TR(
                                FBL.TD('$node.count'),
                                FBL.FOR('prop', '$properties',
                                    FBL.TD(
                                        //hack to write $hd.style[$prop]
                                        '$prop|setIndex' +
                                        '$node.style|getByIndex')),
                                FBL.TD(
                                    FBL.SPAN({ style:'$node.styleText' },
                                        '$node.text')))))),

            //store a value for later use as an index
            setIndex: function(val) {
                this.index_ = val;
                return '';
            },

            //look up a value in an object using the index stored by setIndex()
            getByIndex: function(o) {
                return o[this.index_];
            },

            /*
             * Return an array of column headings.
             * @param properties {Object} The CSS properties that will be
             *      displayed.
             */
            getColumns: function(properties) {
                return ['count'].concat(properties, 'sample-text')
                    .map(function (name) {
                        return name.replace('-', '-\n');
                    });
            }
        });

        nodes = sortNodes(nodes);

        template.tag.append({
                nodes: nodes,
                properties: PROPERTIES
            }, this.panelNode, template);

        this.showButton(COPY_BUTTON_ID, true);

        this.panelNode._NODES     = this._nodes = nodes;
        this.panelNode._URL_CACHE = this._urlCache;

        this.notify('info', 'Report generated for: ' + win.location);
    }
});

Firebug.registerModule(Firebug.TypographyModule);
Firebug.registerPanel(TypographyPanel);

});
