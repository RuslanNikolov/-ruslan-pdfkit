/*
PDFDocument - represents an entire PDF document
By Devon Govett
*/

import stream from "stream";
import PDFObject from "./object";
import PDFReference from "./reference";
import PDFPage from "./page";
import PDFNameTree from "./name_tree";
import PDFSecurity from "./security";
import ColorMixin from "./mixins/color";
import VectorMixin from "./mixins/vector";
import FontsMixin from "./mixins/fonts";
import TextMixin from "./mixins/text";
import ImagesMixin from "./mixins/images";
import AnnotationsMixin from "./mixins/annotations";
import OutlineMixin from "./mixins/outline";

class PDFDocument extends stream.Readable {
  constructor(options = {}) {
    super(options);
    this.options = options;

    // PDF version
    switch (options.pdfVersion) {
      case "1.4":
        this.version = 1.4;
        break;
      case "1.5":
        this.version = 1.5;
        break;
      case "1.6":
        this.version = 1.6;
        break;
      case "1.7":
      case "1.7ext3":
        this.version = 1.7;
        break;
      default:
        this.version = 1.3;
        break;
    }

    // Whether streams should be compressed
    this.compress =
      this.options.compress != null ? this.options.compress : true;

    this._pageBuffer = [];
    this._pageBufferStart = 0;

    // The PDF object store
    this._offsets = [];
    this._waiting = 0;
    this._ended = false;
    this._offset = 0;
    const Pages = this.ref({
      Type: "Pages",
      Count: 0,
      Kids: []
    });

    Pages.finalize = function() {
      this.offset = this.document._offset;
      this.document._write(this.id + " " + this.gen + " obj");
      this.document._write("<<");
      this.document._write("/Type /Pages");
      this.document._write(`/Count ${this.data.Count}`);
      this.document._write(
        `/Kids [${Buffer.concat(this.data.Kids)
          .slice(0, -1)
          .toString()}]`
      );
      this.document._write(">>");
      this.document._write("endobj");
      return this.document._refEnd(this);
    };
    const Names = this.ref({
      Dests: new PDFNameTree()
    });

    this._root = this.ref({
      Type: "Catalog",
      Pages,
      Names
    });

    // The current page
    this.page = null;

    // Initialize mixins
    this.initColor();
    this.initVector();
    this.initFonts();
    this.initText();
    this.initImages();
    this.initOutline();

    // Initialize the metadata
    this.info = {
      Producer: "PDFKit",
      Creator: "PDFKit",
      CreationDate: new Date()
    };

    if (this.options.info) {
      for (let key in this.options.info) {
        const val = this.options.info[key];
        this.info[key] = val;
      }
    }

    // Generate file ID
    this._id = PDFSecurity.generateFileID(this.info);

    // Initialize security settings
    this._security = PDFSecurity.create(this, options);

    // Write the header
    // PDF version
    this._write(`%PDF-${this.version}`);

    // 4 binary chars, as recommended by the spec
    this._write("%\xFF\xFF\xFF\xFF");

    // Add the first page
    if (this.options.autoFirstPage !== false) {
      this.addPage();
    }
  }
  addNamedDestination(name, ...args) {
    if (args.length === 0) {
      args = ["XYZ", null, null, null];
    }
    if (args[0] === "XYZ" && args[2] !== null) {
      args[2] = this.page.height - args[2];
    }
    args.unshift(this.page.dictionary);
    this._root.data.Names.data.Dests.add(name, args);
  }

  addPage(options) {
    // end the current page if needed
    if (options == null) {
      ({ options } = this);
    }
    if (!this.options.bufferPages) {
      this.flushPages();
    }

    // create a page object
    this.page = new PDFPage(this, options);
    this._pageBuffer.push(this.page);

    // add the page to the object store
    const pages = this._root.data.Pages.data;
    pages.Kids.push(new Buffer(this.page.dictionary + " "));
    pages.Count++;

    // reset x and y coordinates
    this.x = this.page.margins.left;
    this.y = this.page.margins.top;

    // flip PDF coordinate system so that the origin is in
    // the top left rather than the bottom left
    this._ctm = [1, 0, 0, 1, 0, 0];
    this.transform(1, 0, 0, -1, 0, this.page.height);

    this.emit("pageAdded");

    return this;
  }

  bufferedPageRange() {
    return { start: this._pageBufferStart, count: this._pageBuffer.length };
  }

  switchToPage(n) {
    let page;
    if (!(page = this._pageBuffer[n - this._pageBufferStart])) {
      throw new Error(
        `switchToPage(${n}) out of bounds, current buffer covers pages ${
          this._pageBufferStart
        } to ${this._pageBufferStart + this._pageBuffer.length - 1}`
      );
    }

    return (this.page = page);
  }

  flushPages() {
    // this local variable exists so we're future-proof against
    // reentrant calls to flushPages.
    const pages = this._pageBuffer;
    this._pageBuffer = [];
    this._pageBufferStart += pages.length;

    for (let page of pages) {
      page.end();
    }
  }

  ref(data) {
    const ref = new PDFReference(this, this._offsets.length + 1, data);
    this._offsets.push(null); // placeholder for this object's offset once it is finalized
    this._waiting++;
    return ref;
  }

  _read() {}
  // do nothing, but this method is required by node

  _write(data) {
    if (!Buffer.isBuffer(data)) {
      data = new Buffer(data + "\n", "binary");
    }

    this.push(data);
    return (this._offset += data.length);
  }

  addContent(data) {
    this.page.write(data);
    return this;
  }

  _refEnd(ref) {
    this._offsets[ref.id - 1] = ref.offset;
    if (--this._waiting === 0 && this._ended) {
      this._finalize();
      return (this._ended = false);
    }
  }

  end() {
    this.flushPages();
    this._info = this.ref();
    for (let key in this.info) {
      let val = this.info[key];
      if (typeof val === "string") {
        val = new String(val);
      }

      let entry = this.ref(val);
      entry.end();

      this._info.data[key] = entry;
    }

    this._info.end();

    for (let name in this._fontFamilies) {
      const font = this._fontFamilies[name];
      font.finalize();
    }

    this.endOutline();

    this._root.end();
    this._root.data.Pages.end();
    this._root.data.Names.end();

    if (this._security) {
      this._security.end();
    }

    if (this._waiting === 0) {
      return this._finalize();
    } else {
      return (this._ended = true);
    }
  }

  _finalize(fn) {
    // generate xref
    const xRefOffset = this._offset;
    this._write("xref");
    this._write(`0 ${this._offsets.length + 1}`);
    this._write("0000000000 65535 f ");

    for (let offset of this._offsets) {
      offset = `0000000000${offset}`.slice(-10);
      this._write(offset + " 00000 n ");
    }

    // trailer
    const trailer = {
      Size: this._offsets.length + 1,
      Root: this._root,
      Info: this._info,
      ID: [this._id, this._id]
    };
    if (this._security) {
      trailer.Encrypt = this._security.dictionary;
    }

    this._write("trailer");
    this._write(PDFObject.convert(trailer));

    this._write("startxref");
    this._write(`${xRefOffset}`);
    this._write("%%EOF");

    // end the stream
    return this.push(null);
  }

  toString() {
    return "[object PDFDocument]";
  }
}

const mixin = methods => {
  Object.assign(PDFDocument.prototype, methods);
};

mixin(ColorMixin);
mixin(VectorMixin);
mixin(FontsMixin);
mixin(TextMixin);
mixin(ImagesMixin);
mixin(AnnotationsMixin);
mixin(OutlineMixin);

export default PDFDocument;
