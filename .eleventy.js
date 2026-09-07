const { DateTime } = require("luxon");
const CleanCSS = require("clean-css");
const UglifyJS = require("uglify-js");
const htmlmin = require("html-minifier");
const eleventyNavigationPlugin = require("@11ty/eleventy-navigation");
const rssPlugin = require("@11ty/eleventy-plugin-rss");
const sitemapPlugin = require("@quasibit/eleventy-plugin-sitemap");
const pluginTOC = require('eleventy-plugin-toc');
const fs = require("fs");

// Safely load the lexicon data so the build doesn't crash if the file is missing
let lexicon = {};
if (fs.existsSync("./_data/lexicon.json")) {
  lexicon = require("./_data/lexicon.json");
}

module.exports = function(eleventyConfig) {

  // Register Plugins
  // Eleventy Navigation https://www.11ty.dev/docs/plugins/navigation/
  eleventyConfig.addPlugin(pluginTOC, {
    tags: ['h2', 'h3', 'h4'],
    wrapper: 'nav',
    wrapperClass: 'toc-nav',
    ul: true,
    flat: false
  });

  eleventyConfig.addPlugin(eleventyNavigationPlugin);
  eleventyConfig.addPlugin(rssPlugin);
  eleventyConfig.addPlugin(sitemapPlugin, {
    sitemap: {
      hostname: "https://thewaspalloy.org",
    },
  });

  // This is required for the JSON-LD schema in head.njk
  // Date formatting (ISO 8601 / RFC3339) for Schema and RSS
  eleventyConfig.addFilter("dateToRfc3339", (dateObj) => {
    if (!dateObj) return "";
    try {
      const date = (dateObj instanceof Date) ? dateObj : new Date(dateObj);
      if (isNaN(date.getTime())) return "";
      return DateTime.fromJSDate(date).toISO();
    } catch (e) {
      return "";
    }
  });

  // Ensure robots.txt is copied to the live site
  eleventyConfig.addPassthroughCopy("robots.txt");

  // Configuration API: use eleventyConfig.addLayoutAlias(from, to) to add
  // layout aliases! Say you have a bunch of existing content using
  // layout: post. If you don’t want to rewrite all of those values, just map
  // post to a new file like this:
  // eleventyConfig.addLayoutAlias("post", "layouts/my_new_post_layout.njk");

  // Merge data instead of overriding
  // https://www.11ty.dev/docs/data-deep-merge/
  eleventyConfig.setDataDeepMerge(true);

  // Add support for maintenance-free post authors
  // Adds an authors collection using the author key in our post frontmatter
  // Thanks to @pdehaan: https://github.com/pdehaan
  eleventyConfig.addCollection("authors", collection => {
    const blogs = collection.getFilteredByGlob("posts/*.md");
    return blogs.reduce((coll, post) => {
      const author = post.data.author;
      if (!author) {
        return coll;
      }
      if (!coll.hasOwnProperty(author)) {
        coll[author] = [];
      }
      coll[author].push(post.data);
      return coll;
    }, {});
  });

  // Date formatting (human readable)
  eleventyConfig.addFilter("readableDate", dateObj => {
    return DateTime.fromJSDate(dateObj).toFormat("dd LLL yyyy");
  });

  // Date formatting (machine readable)
  eleventyConfig.addFilter("machineDate", dateObj => {
    return DateTime.fromJSDate(dateObj).toFormat("yyyy-MM-dd");
  });

  // Minify CSS
  eleventyConfig.addFilter("cssmin", function(code) {
    return new CleanCSS({}).minify(code).styles;
  });

  // Minify JS
  eleventyConfig.addFilter("jsmin", function(code) {
    let minified = UglifyJS.minify(code);
    if (minified.error) {
      console.log("UglifyJS error: ", minified.error);
      return code;
    }
    return minified.code;
  });

  // Minify HTML output
  eleventyConfig.addTransform("htmlmin", function(content, outputPath) {
    if (outputPath.indexOf(".html") > -1) {
      let minified = htmlmin.minify(content, {
        useShortDoctype: true,
        removeComments: true,
        collapseWhitespace: true
      });
      return minified;
    }
    return content;
  });

  // Don't process folders with static assets e.g. images
  // --- Targeted Automatic Lexicon Scanner Transform ---
  eleventyConfig.addTransform("autoLexicon", function(content, outputPath) {
    if (outputPath && outputPath.endsWith(".html") && content.includes("post-main-content")) {
      
      let currentLexicon = {};
      if (fs.existsSync("./_data/lexicon.json")) {
        try {
          currentLexicon = JSON.parse(fs.readFileSync("./_data/lexicon.json", "utf8"));
        } catch (e) {
          currentLexicon = {};
        }
      }

      return content.replace(/(<article class="post-main-content">)([\s\S]*?)(<\/article>)/, (match, openTag, body, closeTag) => {
        let updatedBody = body;

        // 1. Sort entries by length descending so longest compound phrases match first
        const sortedEntries = Object.entries(currentLexicon).sort((a, b) => b[0].length - a[0].length);

        for (const [term, definition] of sortedEntries) {
          const safeDef = definition.replace(/"/g, '&quot;');
          
          // 2. Protect existing <a>, <h1-6>, <pre>, <code>, and ALREADY WRAPPED .lexicon-term spans
          const regex = new RegExp(`(<a\\b[^>]*>[\\s\\S]*?<\\/a>|<span\\b[^>]*class="[^"]*lexicon-term[^"]*"[^>]*>[\\s\\S]*?<\\/span>|<h[1-6]\\b[^>]*>[\\s\\S]*?<\\/h[1-6]>|<pre\\b[^>]*>[\\s\\S]*?<\\/pre>|<code\\b[^>]*>[\\s\\S]*?<\\/code>|<[^>]+>)|\\b(${term})\\b`, "gi");

          updatedBody = updatedBody.replace(regex, (m, tag, word) => {
            // If it matched any protected tag or an already-wrapped span, leave it untouched
            if (tag) return tag;
            return `<span class="lexicon-term" data-term="${term}" data-definition="${safeDef}" tabindex="0">${word}</span>`;
          });
        }

        return openTag + updatedBody + closeTag;
      });
    }
    return content;
  });

  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("static/img");
  eleventyConfig.addPassthroughCopy("admin/");
  // We additionally output a copy of our CSS for use in Decap CMS previews
  eleventyConfig.addPassthroughCopy("_includes/assets/css/inline.css");

  eleventyConfig.addShortcode("get_first_image", (content) => {
    if (!content) return "";
    
    // This regex looks for the 'src' inside an <img> tag
    const m = content.match(/<img [^>]*src="([^"]+)"/);
    
    if (m) return m[1];
    return ""; // Default empty fallback
  });

  /* Markdown Plugins */
  let markdownIt = require("markdown-it");
  let markdownItAnchor = require("markdown-it-anchor");
  let options = {
    html: true,
    breaks: true,
    linkify: true
  };
  let opts = {
    permalink: false
  };

  let md = markdownIt(options).use(markdownItAnchor, opts);

  // --- NEW: Custom Inline Markdown Syntax parser for &term&(definition) ---
  md.inline.ruler.after('text', 'lexicon_term', (state, silent) => {
    const start = state.pos;
    // Check if the current character is an ampersand '&'
    if (state.src.charCodeAt(start) !== 0x26) return false;

    // Look for the exact pattern &term&(definition)
    const match = state.src.slice(start).match(/^&([^&]+)&\(([^)]+)\)/);
    if (!match) return false;

    if (!silent) {
      const tokenOpen = state.push('html_inline', '', 0);
      const safeTerm = md.utils.escapeHtml(match[1]);
      const safeDef = md.utils.escapeHtml(match[2]);
      tokenOpen.content = `<span class="lexicon-term" data-definition="${safeDef}" tabindex="0">${safeTerm}</span>`;
    }

    state.pos += match[0].length;
    return true;
  });

  eleventyConfig.setLibrary("md", md);

  return {
    templateFormats: ["md", "njk", "liquid"],

    // If your site lives in a different subdirectory, change this.
    // Leading or trailing slashes are all normalized away, so don’t worry about it.
    // If you don’t have a subdirectory, use "" or "/" (they do the same thing)
    // This is only used for URLs (it does not affect your file structure)
    pathPrefix: "/",
    markdownTemplateEngine: "liquid",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site"
    }
  };
};
