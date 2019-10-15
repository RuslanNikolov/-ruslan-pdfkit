// import LineWrapper from '../line_wrapper';
import PDFObject from "../object";

const LineWrapper = () => {};

const { number } = PDFObject;

export default {
  initText() {
    this._line = this._line.bind(this);
    // Current coordinates
    this.x = 0;
    this.y = 0;
    return (this._lineGap = 0);
  },

  lineGap(_lineGap) {
    this._lineGap = _lineGap;
    return this;
  },

  moveDown(lines) {
    if (lines == null) {
      lines = 1;
    }
    this.y += this.currentLineHeight(true) * lines + this._lineGap;
    return this;
  },

  moveUp(lines) {
    if (lines == null) {
      lines = 1;
    }
    this.y -= this.currentLineHeight(true) * lines + this._lineGap;
    return this;
  },

  _text(text, x, y, options, lineCallback) {
    options = this._initOptions(x, y, options);

    // Convert text to a string
    text = text == null ? "" : `${text}`;

    // if the wordSpacing option is specified, remove multiple consecutive spaces
    if (options.wordSpacing) {
      text = text.replace(/\s{2,}/g, " ");
    }

    // word wrapping
    if (options.width) {
      let wrapper = this._wrapper;
      if (!wrapper) {
        wrapper = new LineWrapper(this, options);
        wrapper.on("line", lineCallback);
      }

      this._wrapper = options.continued ? wrapper : null;
      this._textOptions = options.continued ? options : null;
      wrapper.wrap(text, options);

      // render paragraphs as single lines
    } else {
      for (let line of text.split("\n")) {
        lineCallback(line, options);
      }
    }

    return this;
  },

  text(text, x, y, options) {
    return this._text(text, x, y, options, this._line);
  },

  widthOfString(string, options) {
    if (options == null) {
      options = {};
    }
    return (
      this._font.widthOfString(string, this._fontSize, options.features) +
      (options.characterSpacing || 0) * (string.length - 1)
    );
  },

  heightOfString(text, options) {
    if (options == null) {
      options = {};
    }
    const { x, y } = this;

    options = this._initOptions(options);
    options.height = Infinity; // don't break pages

    const lineGap = options.lineGap || this._lineGap || 0;
    this._text(text, this.x, this.y, options, (line, options) => {
      return (this.y += this.currentLineHeight(true) + lineGap);
    });

    const height = this.y - y;
    this.x = x;
    this.y = y;

    return height;
  },

  list(list, x, y, options, wrapper) {
    options = this._initOptions(x, y, options);

    const listType = options.listType || "bullet";
    const unit = Math.round((this._font.ascender / 1000) * this._fontSize);
    const midLine = unit / 2;
    const r = options.bulletRadius || unit / 3;
    const indent =
      options.textIndent || (listType === "bullet" ? r * 5 : unit * 2);
    const itemIndent =
      options.bulletIndent || (listType === "bullet" ? r * 8 : unit * 2);

    let level = 1;
    const items = [];
    const levels = [];
    const numbers = [];

    var flatten = function(list) {
      let n = 1;
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (Array.isArray(item)) {
          level++;
          flatten(item);
          level--;
        } else {
          items.push(item);
          levels.push(level);
          if (listType !== "bullet") {
            numbers.push(n++);
          }
        }
      }
    };

    flatten(list);

    const label = function(n) {
      switch (listType) {
        case "numbered":
          return `${n}.`;
        case "lettered":
          var letter = String.fromCharCode(((n - 1) % 26) + 65);
          var times = Math.floor((n - 1) / 26 + 1);
          var text = Array(times + 1).join(letter);
          return `${text}.`;
      }
    };

    wrapper = new LineWrapper(this, options);
    wrapper.on("line", this._line);

    level = 1;
    let i = 0;
    wrapper.on("firstLine", () => {
      let l;
      if ((l = levels[i++]) !== level) {
        const diff = itemIndent * (l - level);
        this.x += diff;
        wrapper.lineWidth -= diff;
        level = l;
      }

      switch (listType) {
        case "bullet":
          this.circle(this.x - indent + r, this.y + midLine, r);
          return this.fill();
        case "numbered":
        case "lettered":
          var text = label(numbers[i - 1]);
          return this._fragment(text, this.x - indent, this.y, options);
      }
    });

    wrapper.on("sectionStart", () => {
      const pos = indent + itemIndent * (level - 1);
      this.x += pos;
      return (wrapper.lineWidth -= pos);
    });

    wrapper.on("sectionEnd", () => {
      const pos = indent + itemIndent * (level - 1);
      this.x -= pos;
      return (wrapper.lineWidth += pos);
    });

    wrapper.wrap(items.join("\n"), options);

    return this;
  },

  _initOptions(x, y, options) {
    if (x == null) {
      x = {};
    }
    if (options == null) {
      options = {};
    }
    if (typeof x === "object") {
      options = x;
      x = null;
    }

    // clone options object
    options = (function() {
      const opts = {};
      for (let k in options) {
        const v = options[k];
        opts[k] = v;
      }
      return opts;
    })();

    // extend options with previous values for continued text
    if (this._textOptions) {
      for (let key in this._textOptions) {
        const val = this._textOptions[key];
        if (key !== "continued") {
          if (options[key] == null) {
            options[key] = val;
          }
        }
      }
    }

    // Update the current position
    if (x != null) {
      this.x = x;
    }
    if (y != null) {
      this.y = y;
    }

    // wrap to margins if no x or y position passed
    if (options.lineBreak !== false) {
      if (options.width == null) {
        options.width = this.page.width - this.x - this.page.margins.right;
      }
    }

    if (!options.columns) {
      options.columns = 0;
    }
    if (options.columnGap == null) {
      options.columnGap = 18;
    } // 1/4 inch

    return options;
  },

  _line(text, options, wrapper) {
    if (options == null) {
      options = {};
    }
    this._fragment(text, this.x, this.y, options);
    const lineGap = options.lineGap || this._lineGap || 0;

    if (!wrapper) {
      return (this.x += this.widthOfString(text));
    } else {
      return (this.y += this.currentLineHeight(true) + lineGap);
    }
  },

  _fragment(text, x, y, options) {
    let dy, encoded, i, positions, textWidth, words;
    text = `${text}`.replace(/\n/g, "");
    if (text.length === 0) {
      return;
    }

    // handle options
    const align = options.align || "left";
    let wordSpacing = options.wordSpacing || 0;
    const characterSpacing = options.characterSpacing || 0;

    // text alignments
    if (options.width) {
      switch (align) {
        case "right":
          textWidth = this.widthOfString(text.replace(/\s+$/, ""), options);
          x += options.lineWidth - textWidth;
          break;

        case "center":
          x += options.lineWidth / 2 - options.textWidth / 2;
          break;

        case "justify":
          // calculate the word spacing value
          words = text.trim().split(/\s+/);
          textWidth = this.widthOfString(text.replace(/\s+/g, ""), options);
          var spaceWidth = this.widthOfString(" ") + characterSpacing;
          wordSpacing = Math.max(
            0,
            (options.lineWidth - textWidth) / Math.max(1, words.length - 1) -
              spaceWidth
          );
          break;
      }
    }

    // text baseline alignments based on http://wiki.apache.org/xmlgraphics-fop/LineLayout/AlignmentHandling
    if (typeof options.baseline === "number") {
      dy = -options.baseline;
    } else {
      switch (options.baseline) {
        case "svg-middle":
          dy = 0.5 * this._font.xHeight;
          break;
        case "middle":
        case "svg-central":
          dy = 0.5 * (this._font.descender + this._font.ascender);
          break;
        case "bottom":
        case "ideographic":
          dy = this._font.descender;
          break;
        case "alphabetic":
          dy = 0;
          break;
        case "mathematical":
          dy = 0.5 * this._font.ascender;
          break;
        case "hanging":
          dy = 0.8 * this._font.ascender;
          break;
        case "top":
          dy = this._font.ascender;
          break;
        default:
          dy = this._font.ascender;
      }
      dy = (dy / 1000) * this._fontSize;
    }

    // calculate the actual rendered width of the string after word and character spacing
    const renderedWidth =
      options.textWidth +
      wordSpacing * (options.wordCount - 1) +
      characterSpacing * (text.length - 1);

    // create link annotations if the link option is given
    if (options.link != null) {
      this.link(x, y, renderedWidth, this.currentLineHeight(), options.link);
    }
    if (options.goTo != null) {
      this.goTo(x, y, renderedWidth, this.currentLineHeight(), options.goTo);
    }
    if (options.destination != null) {
      this.addNamedDestination(options.destination, "XYZ", x, y, null);
    }

    // create underline or strikethrough line
    if (options.underline || options.strike) {
      this.save();
      if (!options.stroke) {
        this.strokeColor(...(this._fillColor || []));
      }

      const lineWidth =
        this._fontSize < 10 ? 0.5 : Math.floor(this._fontSize / 10);
      this.lineWidth(lineWidth);

      const d = options.underline ? 1 : 2;
      let lineY = y + this.currentLineHeight() / d;
      if (options.underline) {
        lineY -= lineWidth;
      }

      this.moveTo(x, lineY);
      this.lineTo(x + renderedWidth, lineY);
      this.stroke();
      this.restore();
    }

    this.save();

    // oblique (angle in degrees or boolean)
    if (options.oblique) {
      let skew;
      if (typeof options.oblique === "number") {
        skew = -Math.tan((options.oblique * Math.PI) / 180);
      } else {
        skew = -0.25;
      }
      this.transform(1, 0, 0, 1, x, y);
      this.transform(1, 0, skew, 1, -skew * dy, 0);
      this.transform(1, 0, 0, 1, -x, -y);
    }

    // flip coordinate system
    this.transform(1, 0, 0, -1, 0, this.page.height);
    y = this.page.height - y - dy;

    // add current font to page if necessary
    if (this.page.fonts[this._font.id] == null) {
      this.page.fonts[this._font.id] = this._font.ref();
    }

    // begin the text object
    this.addContent("BT");

    // text position
    this.addContent(`1 0 0 1 ${number(x)} ${number(y)} Tm`);

    // font and font size
    this.addContent(`/${this._font.id} ${number(this._fontSize)} Tf`);

    // rendering mode
    const mode = options.fill && options.stroke ? 2 : options.stroke ? 1 : 0;
    if (mode) {
      this.addContent(`${mode} Tr`);
    }

    // Character spacing
    if (characterSpacing) {
      this.addContent(`${number(characterSpacing)} Tc`);
    }

    // Add the actual text
    // If we have a word spacing value, we need to encode each word separately
    // since the normal Tw operator only works on character code 32, which isn't
    // used for embedded fonts.
    if (wordSpacing) {
      words = text.trim().split(/\s+/);
      wordSpacing += this.widthOfString(" ") + characterSpacing;
      wordSpacing *= 1000 / this._fontSize;

      encoded = [];
      positions = [];
      for (let word of words) {
        const [encodedWord, positionsWord] = this._font.encode(
          word,
          options.features
        );
        encoded.push(...(encodedWord || []));
        positions.push(...(positionsWord || []));

        // add the word spacing to the end of the word
        // clone object because of cache
        const space = {};
        const object = positions[positions.length - 1];
        for (let key in object) {
          const val = object[key];
          space[key] = val;
        }
        space.xAdvance += wordSpacing;
        positions[positions.length - 1] = space;
      }
    } else {
      [encoded, positions] = this._font.encode(text, options.features);
    }

    const scale = this._fontSize / 1000;
    const commands = [];
    let last = 0;
    let hadOffset = false;

    // Adds a segment of text to the TJ command buffer
    const addSegment = cur => {
      if (last < cur) {
        const hex = encoded.slice(last, cur).join("");
        const advance =
          positions[cur - 1].xAdvance - positions[cur - 1].advanceWidth;
        commands.push(`<${hex}> ${number(-advance)}`);
      }

      return (last = cur);
    };

    // Flushes the current TJ commands to the output stream
    const flush = i => {
      addSegment(i);

      if (commands.length > 0) {
        this.addContent(`[${commands.join(" ")}] TJ`);

        return (commands.length = 0);
      }
    };

    for (i = 0; i < positions.length; i++) {
      // If we have an x or y offset, we have to break out of the current TJ command
      // so we can move the text position.
      const pos = positions[i];
      if (pos.xOffset || pos.yOffset) {
        // Flush the current buffer
        flush(i);

        // Move the text position and flush just the current character
        this.addContent(
          `1 0 0 1 ${number(x + pos.xOffset * scale)} ${number(
            y + pos.yOffset * scale
          )} Tm`
        );
        flush(i + 1);

        hadOffset = true;
      } else {
        // If the last character had an offset, reset the text position
        if (hadOffset) {
          this.addContent(`1 0 0 1 ${number(x)} ${number(y)} Tm`);
          hadOffset = false;
        }

        // Group segments that don't have any advance adjustments

        if (pos.xAdvance - pos.advanceWidth !== 0) {
          addSegment(i + 1);
        }
      }

      x += pos.xAdvance * scale;
    }

    // Flush any remaining commands
    flush(i);

    // end the text object
    this.addContent("ET");

    // restore flipped coordinate system
    return this.restore();
  },

  _addGlyphs(glyphs, positions, x, y, options) {
    // add current font to page if necessary
    if (options == null) {
      options = {};
    }
    if (this.page.fonts[this._font.id] == null) {
      this.page.fonts[this._font.id] = this._font.ref();
    }

    // Adjust y to match coordinate flipping
    y = this.page.height - y;

    const scale = 1000 / this._fontSize;
    const unitsPerEm = this._font.font.unitsPerEm || 1000;
    const advanceWidthScale = 1000 / unitsPerEm;

    // Glyph encoding and positioning
    const encodedGlyphs = this._font.encodeGlyphs(glyphs);
    const encodedPositions = positions.map((pos, i) => ({
      xAdvance: pos.xAdvance * scale,
      yAdvance: pos.yAdvance * scale,
      xOffset: pos.xOffset,
      yOffset: pos.yOffset,
      advanceWidth: glyphs[i].advanceWidth * advanceWidthScale
    }));

    return this._glyphs(encodedGlyphs, encodedPositions, x, y, options);
  },

  _glyphs(encoded, positions, x, y, options) {
    // flip coordinate system
    let i;
    this.save();
    this.transform(1, 0, 0, -1, 0, this.page.height);

    // begin the text object
    this.addContent("BT");

    // text position
    this.addContent(`1 0 0 1 ${PDFObject.number(x)} ${PDFObject.number(y)} Tm`);

    // font and font size
    this.addContent(`/${this._font.id} ${PDFObject.number(this._fontSize)} Tf`);

    // rendering mode
    const mode = options.fill && options.stroke ? 2 : options.stroke ? 1 : 0;
    if (mode) {
      this.addContent(`${mode} Tr`);
    }

    // Character spacing
    if (options.characterSpacing) {
      this.addContent(`${PDFObject.number(options.characterSpacing)} Tc`);
    }

    const scale = this._fontSize / 1000;
    const commands = [];
    let last = 0;
    let hadOffset = false;

    // Adds a segment of text to the TJ command buffer
    const addSegment = cur => {
      if (last < cur) {
        const hex = encoded.slice(last, cur).join("");
        const advance =
          positions[cur - 1].xAdvance - positions[cur - 1].advanceWidth;
        commands.push(`<${hex}> ${PDFObject.number(-advance)}`);
      }

      return (last = cur);
    };

    // Flushes the current TJ commands to the output stream
    const flush = i => {
      addSegment(i);

      if (commands.length > 0) {
        this.addContent(`[${commands.join(" ")}] TJ`);
        return (commands.length = 0);
      }
    };

    for (i = 0; i < positions.length; i++) {
      // If we have an x or y offset, we have to break out of the current TJ command
      // so we can move the text position.
      const pos = positions[i];
      if (pos.xOffset || pos.yOffset) {
        // Flush the current buffer
        flush(i);

        // Move the text position and flush just the current character
        this.addContent(
          `1 0 0 1 ${PDFObject.number(
            x + pos.xOffset * scale
          )} ${PDFObject.number(y + pos.yOffset * scale)} Tm`
        );
        flush(i + 1);

        hadOffset = true;
      } else {
        // If the last character had an offset, reset the text position
        if (hadOffset) {
          this.addContent(
            `1 0 0 1 ${PDFObject.number(x)} ${PDFObject.number(y)} Tm`
          );
          hadOffset = false;
        }

        // Group segments that don't have any advance adjustments
        if (pos.xAdvance - pos.advanceWidth !== 0) {
          addSegment(i + 1);
        }
      }

      x += pos.xAdvance * scale;
    }

    // Flush any remaining commands
    flush(i);

    // end the text object
    this.addContent("ET");

    // restore flipped coordinate system
    return this.restore();
  }
};
