class PDFOutline {
  constructor(document, parent, title, dest, options) {
    this.document = document;
    if (options == null) { options = { expanded: false }; }
    this.options = options;
    this.outlineData = {};

    if (dest !== null) {
      this.outlineData['Dest'] = [dest.dictionary, 'Fit'];
    }

    if (parent !== null) {
      this.outlineData['Parent'] = parent;
    }

    if (title !== null) {
      this.outlineData['Title'] = new String(title);
    }

    this.dictionary = this.document.ref(this.outlineData);
    this.children = [];
  }

  addItem(title, options) {
    if (options == null) { options = { expanded: false }; }
    const result = new PDFOutline(this.document, this.dictionary, title, this.document.page, options);
    this.children.push(result);

    return result;
  }

  endOutline() {
    let end;
    if (this.children.length > 0) {
      let asc, i;
      if (this.options.expanded) {
        this.outlineData.Count = this.children.length;
      }

      const first = this.children[0], last = this.children[this.children.length - 1];
      this.outlineData.First = first.dictionary;
      this.outlineData.Last = last.dictionary;

      for (i = 0, end = this.children.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        const child = this.children[i];
        if (i > 0) {
          child.outlineData.Prev = this.children[i-1].dictionary;
        }
        if (i < (this.children.length - 1)) {
          child.outlineData.Next = this.children[i+1].dictionary;
        }
        child.endOutline();
      }
    }

    return this.dictionary.end();
  }
}


export default PDFOutline;