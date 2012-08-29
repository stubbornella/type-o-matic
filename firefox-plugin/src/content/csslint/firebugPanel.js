/*global FBL, Firebug, NodeFilter, domplate*/
FBL.ns(function() {

//TODO: bug in the sibling node style checking ... it's not added to the DOM
//and thus computed style values are bogus

var EXAMPLE_TEXT_MAXCHARS = 256,
    NODETYPE_TEXT = 3,
    CSSLINT_PROP_TEST_TAG = "_CSSLINT_",
    BOLD_WEIGHT = 700,
    BUTTONS_ID = "fbCssLintButtons",
    RE_HEADER = /^(?:h[1-6]|header)$/,
    RE_SKIP = /^(?:script|style)$/,

    triggerProperties = [
        "font-size"
    ],
    collectProperties = [
        "font-family",
        "font-size",
        "font-weight",
        "font-variant",
        "font-style",
        "color",
        "text-transform",
        "text-decoration",
        "letter-spacing",
        "word-spacing"
    ];


//--- Utility functions

/**
 * Truncate string to the given number of characters and append an ellipsis.
 * @param {String} s
 * @param {Integer} n
 * @return {String}
 */
function truncateString(s, n) {
    if (s.length > n) {
        s = s.substr(0, n) + "...";
    }
    return s;
}

/**
 * Returns a canonical representation of a style object.
 * @param {Object} style
 * @return {String}
 */
function styleToCanonicalString(style) {
    var result = [],
        keys = FBL.keys(style),
        key,
        i;
    keys.sort();
    for (i = 0; i < keys.length; i++) {
        key = keys[i];
        result.push(key + ":" + style[key]);
    }
    return result.join(";");
}

/**
 * Is the given node considered a heading?
 * @param {HTMLElement} node
 * @return {Boolean}
 */
function isHeading(node) {
    var result = false,
        firstChild = node.firstChild,
        tagName = node.tagName.toLowerCase(),
        doc = node.ownerDocument,
        testElt,
        testStyle,
        nodeStyle,
        triggerProp,
        i;

    if (tagName.match(RE_HEADER)) {
        result = true;
    } else if (tagName.match(RE_SKIP)) {
        result = false;
    } else if (firstChild &&
            firstChild.nodeType == NODETYPE_TEXT &&
            firstChild.nodeValue &&
            firstChild.nodeValue.trim() !== "")
    {
        // Skip nodes that don't immediately contain text to avoid picking up
        // the parent node and the child node as separate headings.

        // Without an API to determine whether a computed style value is
        // inherited or explicitly set, inject a sibling and compare with its
        // property values. A mismatch indicated custom styling. This works
        // alright with font-size, but might not work with other properties.

        testElt = doc.getElementById(CSSLINT_PROP_TEST_TAG) ||
            doc.createElement(CSSLINT_PROP_TEST_TAG);
        testElt.style.display = "none";

        testStyle = doc.defaultView.getComputedStyle(testElt, null);
        nodeStyle = doc.defaultView.getComputedStyle(node, null);

        result = true;
        for (i = 0; result && i < triggerProperties.length; i++) {
            triggerProp = triggerProperties[i];
            result = testStyle.getPropertyCSSValue(triggerProp).cssText !=
                nodeStyle.getPropertyCSSValue(triggerProp).cssText;
        }

    }
    return result;
}

/**
 * Collect headings within a document.
 * @param {Document} doc
 * @return {Array}
 */
function collectHeadings(doc) {
    var treeWalker = doc.createTreeWalker(doc.documentElement,
            NodeFilter.SHOW_ELEMENT, null, false),
        headings = [],
        style,
        node,
        nodeComputedStyle,
        prop,
        propVal,
        i;

    while (treeWalker.nextNode()) {
        node = treeWalker.currentNode;
        if (!node.textContent || !isHeading(node)) {
            continue;
        }

        style = {};
        nodeComputedStyle = doc.defaultView.getComputedStyle(node, null);
        for (i = 0; i < collectProperties.length; i++) {
            prop = collectProperties[i];
            propVal = nodeComputedStyle.getPropertyCSSValue(prop);
            if (propVal) {
                style[prop] = propVal.cssText;
            }
        }

        //assume that we always collect at least one property
        headings.push({
            tag: node.tagName,
            text: truncateString(node.textContent, EXAMPLE_TEXT_MAXCHARS),
            style: style
        });
    }

    return headings;
}

/**
 * Collect unique headings within a document.
 * @param {Document} doc
 * @return {Array}
 */
function uniqueHeadings(doc) {
    var headings = collectHeadings(doc),
        heading,
        unique = {},
        key,
        i;

    for (i = 0; i < headings.length; i++) {
        heading = headings[i];
        key = styleToCanonicalString(heading.style);
        if (!unique[key]) {
            unique[key] = heading;
            heading.count = 1;
        } else {
            unique[key].count++;
        }
    }
    return FBL.values(unique);
}

/**
 * Create a child element of the parent.
 * @param {HTMLElement} parent
 * @param {String} nodeType
 * @return {HTMLElement} The created element
 */
function createDummyNode(parent, nodeType) {
    var doc = parent.ownerDocument,
        elt = doc.createElement(nodeType);

    parent.appendChild(elt);
    return elt;
}

/**
 * A sort function for headings to display in the UI
 * @param {Object} a A heading object
 * @param {Object} b A heading object
 * @return {Number} -1, 0, 1 for a < b, a == b, a > b
 */
function headingComparer(a, b) {
    var aStyle = a.style,
        bStyle = b.style,
        aFontSize = parseInt(aStyle["font-size"], 10),
        bFontSize = parseInt(bStyle["font-size"], 10),
        aFontWeight = aStyle["font-weight"],
        bFontWeight = bStyle["font-weight"],
        result;

    aFontWeight = (aFontWeight == "bold") ? BOLD_WEIGHT : parseInt(aFontWeight, 10);
    bFontWeight = (bFontWeight == "bold") ? BOLD_WEIGHT : parseInt(bFontWeight, 10);

    // Determine sort order

    result = bFontSize - aFontSize ||   // font-size descending
        bFontWeight - aFontWeight;      // font-weight descending
    return result;
}


//--- Firebug hooks

Firebug.CssLintModule = FBL.extend(Firebug.Module, {
    addStyleSheet: function(doc) {
        // Make sure the stylesheet isn't appended twice.
        if (FBL.$("csslintStyles", doc)) {
            return;
        }

        var styleSheet = FBL.createStyleSheet(doc,
            "chrome://csslint/skin/csslint.css");
        styleSheet.setAttribute("id", "csslintStyles");
        FBL.addStyleSheet(doc, styleSheet);
    },

    reattachContext: function(browser, context) {
        //TODO: panelName not declared, guessing FBL. prefix, code copied from http://www.softwareishard.com/blog/firebug-tutorial/extending-firebug-yahoo-search-part-vi/#more-15
        var panel = context.getPanel(FBL.panelName);
        this.addStyleSheet(panel.document);
    }
});

function CssLintPanel() { }
CssLintPanel.prototype = FBL.extend(Firebug.Panel, {
    name: "csslint",
    title: "CSS Lint",
    searchable: false,
    editable: false,

    //--- Overridden panel functions

    initialize: function() {
        Firebug.Panel.initialize.apply(this, arguments);
        Firebug.CssLintModule.addStyleSheet(this.document);
    },

    show: function(state) {
        this.showToolbarButtons(BUTTONS_ID, true);
    },

    hide: function() {
        this.showToolbarButtons(BUTTONS_ID, false);
    },

    //--- Command entry points

    cmdHeadings: function() {
        var win = this.context.window,
            doc = win.document,
            headings = uniqueHeadings(doc),
            template;

        template = domplate({
            index_: "",

            tag:
                FBL.DIV({ "class":"csslint-report" },
                    FBL.TABLE(
                        //table headings
                        FBL.TR(
                            FBL.FOR("name", "$properties|getColumns",
                                FBL.TH("$name"))),
                        //loop over and write heading values
                        FBL.FOR("hd", "$headings",
                            FBL.TR(
                                FBL.TD("$hd.count"),
                                FBL.FOR("prop", "$properties",
                                    FBL.TD(
                                        //hack to write $hd.style[$prop]
                                        "$prop|setIndex" +
                                        "$hd.style|getByIndex")),
                                FBL.TD(
                                    FBL.SPAN({ style:"$hd.style|toStyleString" },
                                        "$hd.text")))))),

            //store a value for later use as an index
            setIndex: function(val) {
                this.index_ = val;
                return "";
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
                return ["count"].concat(properties).concat(["sample-text"]);
            },

            //get the string for a style object
            toStyleString: function(style) {
                var i, s = [];
                for (i in style) {
                    if (style.hasOwnProperty(i)) {
                        s.push(i + ":" + style[i] + ";");
                    }
                }
                return s.join("");
            }
        });

        headings.sort(headingComparer);
        template.tag.append({
                headings: headings,
                properties: collectProperties
            }, this.panelNode, template);
    }
});

Firebug.registerModule(Firebug.CssLintModule);
Firebug.registerPanel(CssLintPanel);

});

