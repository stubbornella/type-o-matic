Type-o-matic
============

A browser (firebug, currently) extension that counts all the fonts on a page and orders them by color and size before happily outputting some json. It currently outputs the following type information:

* count	
* font-family	
* font-size	
* font-weight	
* font-variant	
* font-style	
* color	
* text-transform	
* text-decoration	
* text-shadow	
* letter-spacing	
* word-spacing	
* sample-text

Getting Started
---------------
To try it on your site:

1. Download and install the Firebug extension to Firefox
2. Download and install the Typo-o-matic extension to Firebug (I know, I fully intend to port it to Chrome)
3. Now, visit the site you’d like to test 
4. Right click and choose Inspect element with Firebug
5. Now click on the typography tab
6. Click Persist
7. Click Generate Report
8. Choose which pages to analyze (we’ve found that ten is a good number to get the big picture, but you can analyze as many as you’d like — it will even work on just one page!)
9. Now navigate to other pages, and on each subsequent page, click Generate Report
10. The table of results can be a bit difficult to interact with, so you can always click Copy to clipboard, and copy the results (JSON).

Next Steps
----------

1. Port it to chrome

Contributors
------------
* Nicole Sullivan
* Arnaud Gueras
* Anna Debenham
* Fiona Chan
* Laura Millan
* Chris Klaiber
* Brett Stimmerman
