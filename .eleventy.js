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

module.exports = function (eleventyConfig) {

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
  eleventyConfig.addFilter("cssmin", function (code) {
    return new CleanCSS({}).minify(code).styles;
  });

  // Minify JS
  eleventyConfig.addFilter("jsmin", function (code) {
    let minified = UglifyJS.minify(code);
    if (minified.error) {
      console.log("UglifyJS error: ", minified.error);
      return code;
    }
    return minified.code;
  });

  // Minify HTML output
  eleventyConfig.addTransform("htmlmin", function (content, outputPath) {
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
  eleventyConfig.addTransform("autoLexicon", function (content, outputPath) {
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

// --- Reusable Citation Shortcode (With Blockquote Support) ---
  eleventyConfig.addShortcode("citation", function(key, number, customAnchor) {
    let citations = {};
    if (fs.existsSync("./_data/citations.json")) {
      try {
        citations = JSON.parse(fs.readFileSync("./_data/citations.json", "utf8"));
      } catch (e) {
        citations = {};
      }
    }

    const item = citations[key];
    const anchorId = customAnchor || `cite-${number}`;

    if (!item) {
      return `<p><strong>[${number}]</strong> <span id="${anchorId}"></span> [Citation "${key}" not found in _data/citations.json]</p>`;
    }

    // Render blockquote if present
    const quoteHtml = item.quote ? `<blockquote>${item.quote}</blockquote>` : "";

    // Render bullet list only if sources exist
    const sourcesHtml = (item.sources && item.sources.length > 0)
      ? `<ul>\n${item.sources.map(s => s.url ? `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.text}</a></li>` : `<li>${s.text}</li>`).join("\n")}\n</ul>`
      : "";

    return `<p><strong>[${number}]</strong> <span id="${anchorId}"></span> ${item.title}</p>\n${quoteHtml}\n${sourcesHtml}`;
  });

  eleventyConfig.addPassthroughCopy("_includes/assets/fonts"); // This ensures that custom fonts are built into the static website
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("static/img");
  eleventyConfig.addPassthroughCopy("static/audio");
  eleventyConfig.addPassthroughCopy("static/vid");
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

// --- Custom Inline Markdown Syntax parser for !audio[Caption](url) ---
  md.inline.ruler.after('text', 'custom_audio', (state, silent) => {
    const start = state.pos;
    
    if (state.src.charCodeAt(start) !== 0x21) return false;

    const match = state.src.slice(start).match(/^!audio(?:\[([^\]]*)\])?\(([^)]+)\)/);
    if (!match) return false;

    if (!silent) {
      const caption = match[1] ? md.utils.escapeHtml(match[1]) : '';
      const src = md.utils.escapeHtml(match[2]);

      const token = state.push('html_inline', '', 0);
      token.content = `
        <div class="custom-audio-wrapper">
          <div class="custom-audio-player">
            ${caption ? `<p class="audio-caption">🎵 ${caption}</p>` : ''}
            <audio preload="metadata">
              <source src="${src}" type="audio/mpeg">
              Your browser does not support the audio element.
            </audio>
            <div class="audio-controls-row">
              <button type="button" class="audio-btn audio-play-btn" aria-label="Play">
                <svg class="play-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
                <svg class="pause-icon" viewBox="0 0 24 24" width="18" height="18" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              </button>
              <div class="audio-progress-wrap">
                <input type="range" class="audio-seek-bar" min="0" max="100" value="0" step="0.1" aria-label="Seek time">
              </div>
              <div class="audio-time">
                <span class="time-current">0:00</span> / <span class="time-duration">0:00</span>
              </div>
              <button type="button" class="audio-btn audio-mute-btn" aria-label="Mute">
                <svg class="vol-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                <svg class="mute-icon" viewBox="0 0 24 24" width="18" height="18" style="display:none;"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
              </button>
            </div>
          </div>
        </div>`;
    }

    state.pos += match[0].length;
    return true;
  });

  // --- Custom Inline Markdown Syntax parser for !video[Caption](url) ---
  md.inline.ruler.after('text', 'custom_video', (state, silent) => {
    const start = state.pos;
    
    if (state.src.charCodeAt(start) !== 0x21) return false;

    // Matches !video[Caption](url) or !video(url)
    const match = state.src.slice(start).match(/^!video(?:\[([^\]]*)\])?\(([^)]+)\)/);
    if (!match) return false;

    if (!silent) {
      const caption = match[1] ? md.utils.escapeHtml(match[1]) : '';
      const src = md.utils.escapeHtml(match[2]);

      const token = state.push('html_inline', '', 0);
      token.content = `
        <div class="custom-video-wrapper">
          <div class="custom-video-player">
            ${caption ? `<p class="video-caption">🎬 ${caption}</p>` : ''}
            <div class="video-screen-container">
              <video preload="metadata" playsinline>
                <source src="${src}" type="video/mp4">
                Your browser does not support the video element.
              </video>
            </div>
            <div class="video-controls-row">
              <button type="button" class="video-btn video-play-btn" aria-label="Play">
                <svg class="play-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z"/></svg>
                <svg class="pause-icon" viewBox="0 0 24 24" width="18" height="18" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              </button>
              <div class="video-progress-wrap">
                <input type="range" class="video-seek-bar" min="0" max="100" value="0" step="0.1" aria-label="Seek time">
              </div>
              <div class="video-time">
                <span class="time-current">0:00</span> / <span class="time-duration">0:00</span>
              </div>
              <button type="button" class="video-btn video-mute-btn" aria-label="Mute">
                <svg class="vol-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                <svg class="mute-icon" viewBox="0 0 24 24" width="18" height="18" style="display:none;"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
              </button>
              <button type="button" class="video-btn video-fullscreen-btn" aria-label="Fullscreen">
                <svg class="fs-icon" viewBox="0 0 24 24" width="18" height="18"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
              </button>
            </div>
          </div>
        </div>`;
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
