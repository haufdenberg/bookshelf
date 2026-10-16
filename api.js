// ============================================================================
// api.js — external API lookups (Open Library, Google Books, Wikipedia,
// Inventaire) used to auto-fill the Add/Edit Book form
//
// Depends on: config.js (KNOWN_SERIES via autofill.js), utils.js (toTitleCase,
//             showToast), autofill.js (extractSeriesFromText, matchKnownSeries,
//             trySetGenre, inferAgeAndGrade, cleanSummary),
//             lookup-review.js (snapshotForm, restoreSnapshot, openLookupReview)
// Used by:    index.html "Find Series" button → findSeriesInfo()
//             index.html "Auto-Fill" button → lookupISBN()
// ============================================================================

// "Find Series" button handler: tries, in order, (1) the local KNOWN_SERIES
// map, (2) Open Library's search API series field, (3) Google Books'
// seriesInfo / title parsing, (4) a Wikipedia infobox scrape — stopping as
// soon as a series name (and ideally a book number) is found.
async function findSeriesInfo(){
  var title=document.getElementById('f-title').value.trim();
  var author=document.getElementById('f-author').value.trim();
  var isbn=document.getElementById('f-isbn').value.trim().replace(/[^0-9X]/gi,'');
  if(!title&&!isbn){showToast('Fill in the title or ISBN first');return;}

  var btn=document.getElementById('find-series-btn');
  var status=document.getElementById('find-series-status');
  btn.disabled=true;
  status.textContent='Searching…';
  status.style.color='var(--ink-faint)';

  var foundSeries='', foundNum='';

  // ── 1. KNOWN_SERIES exact match ──
  if(title){
    var t=title.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    for(var ki=0;ki<KNOWN_SERIES.length;ki++){
      var entry=KNOWN_SERIES[ki];
      if(entry.titles[t]!==undefined){
        foundSeries=foundSeries||entry.s;
        foundNum=foundNum||(entry.titles[t]||'');
        break;
      }
    }
  }

  // ── 2. Open Library search — series field ──
  if(!foundSeries&&title){
    try{
      status.textContent='Checking Open Library…';
      var olq=encodeURIComponent(title+(author?' '+author.split(' ').slice(-1)[0]:''));
      var olr=await fetch('https://openlibrary.org/search.json?q='+olq+'&fields=key,title,series&limit=8');
      var old=await olr.json();
      if(old.docs){
        for(var oi=0;oi<old.docs.length;oi++){
          var doc=old.docs[oi];
          if(doc.series&&doc.series.length){
            var rs=doc.series[0];
            var nm=rs.match(/#\s*(\d+\.?\d*)|(?:[,\s]+(?:book|vol\.?|volume)?\s*)(\d+\.?\d*)\s*$/i);
            if(nm){
              var en=(nm[1]||nm[2]||'').trim();
              var ename=rs.replace(/#\s*\d+\.?\d*/,'').replace(/[,\s]+(?:book|vol\.?|volume)?\s*\d+\.?\d*\s*$/i,'').replace(/\s*[,\-]\s*$/,'').trim();
              if(ename&&!foundSeries){foundSeries=ename;foundNum=foundNum||en;}
            }else if(!foundSeries){
              foundSeries=rs.trim();
            }
            break;
          }
        }
      }
    }catch(e){}
  }

  // ── 3. Google Books seriesInfo (by ISBN or title) ──
  if(!foundSeries){
    try{
      status.textContent='Checking Google Books…';
      var gbq=isbn?'isbn:'+isbn:encodeURIComponent('intitle:'+title+(author?' inauthor:'+author.split(' ').slice(-1)[0]:''));
      var gbr=await fetch('https://www.googleapis.com/books/v1/volumes?q='+gbq+'&maxResults=8&printType=books');
      var gbd=await gbr.json();
      if(gbd.items){
        for(var gi=0;gi<gbd.items.length;gi++){
          var si=gbd.items[gi].seriesInfo;
          var vi2=gbd.items[gi].volumeInfo||{};
          if(si&&si.shortSeriesBookTitle){
            foundSeries=foundSeries||si.shortSeriesBookTitle;
            if(si.volumeSeries&&si.volumeSeries[0]&&si.volumeSeries[0].orderNumber)
              foundNum=foundNum||si.volumeSeries[0].orderNumber;
            break;
          }
          // Fallback: parse title/subtitle
          if(!foundSeries){
            var fullT=(vi2.title||'')+' '+(vi2.subtitle||'');
            var stmp1=document.getElementById('f-series').value;
            extractSeriesFromText(fullT);
            var stmp2=document.getElementById('f-series').value;
            if(stmp2&&stmp2!==stmp1){
              foundSeries=stmp2;
              foundNum=foundNum||document.getElementById('f-series-num').value;
              // Reset field since we'll apply cleanly below
              document.getElementById('f-series').value=stmp1;
              document.getElementById('f-series-num').value='';
              break;
            }
          }
        }
      }
    }catch(e){}
  }

  // ── 4. Wikipedia infobox ──
  if((!foundSeries||!foundNum)&&title){
    try{
      status.textContent='Checking Wikipedia…';
      var wq=encodeURIComponent(title+(author?' '+author.split(' ')[0]:''));
      var wsr=await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+wq+'&srlimit=5&srprop=snippet&format=json&origin=*');
      var wsd=await wsr.json();
      if(wsd.query&&wsd.query.search&&wsd.query.search.length){
        var wNorm=function(s){return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');};
        var wTN=wNorm(title);
        var wBest=wsd.query.search[0].title;
        for(var wi=0;wi<wsd.query.search.length;wi++){
          var wh=wsd.query.search[wi];
          if(wNorm(wh.title)===wTN||wNorm(wh.title).includes(wTN)||wTN.includes(wNorm(wh.title))){wBest=wh.title;break;}
        }
        var wRaw=await fetch('https://en.wikipedia.org/w/api.php?action=query&titles='+encodeURIComponent(wBest)+'&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*');
        var wRawD=await wRaw.json();
        var wPages=wRawD.query&&wRawD.query.pages;
        if(wPages){
          var wPid=Object.keys(wPages)[0];
          var wText=(wPages[wPid].revisions&&wPages[wPid].revisions[0]&&
            (wPages[wPid].revisions[0]['*']||(wPages[wPid].revisions[0].slots&&wPages[wPid].revisions[0].slots.main&&wPages[wPid].revisions[0].slots.main['*'])))||'';
          if(wText){
            // Series name from infobox
            var sm=wText.match(/[|]\s*series\s*=\s*\[\[([^\]|]+)/i)||wText.match(/[|]\s*series\s*=\s*([^|\]]{3,60})\n/i);
            if(sm&&!foundSeries){
              foundSeries=sm[1].replace(/\[\[|\]\]/g,'').replace(/[|].*/,'').trim();
            }
            // Book number from infobox
            if(!foundNum){
              var nm2=wText.match(/[|]\s*number\s*=\s*(\d+\.?\d*)/i)||
                      wText.match(/[|]\s*preceded_by\s*=.{0,80}\n/i)?null:null;
              var nm3=wText.match(/book\s+(?:no\.?|number|#)?\s*(\d+\.?\d*)\s+(?:in|of)\s+the/i)||
                      wText.match(/#\s*(\d+\.?\d*)\s+(?:in|of)\s+the/i)||
                      wText.match(/[|]\s*number\s*=\s*(\d+\.?\d*)/i);
              if(nm3)foundNum=nm3[1];
            }
          }
        }
      }
    }catch(e){}
  }

  // ── Apply results ──
  btn.disabled=false;
  if(foundSeries||foundNum){
    if(foundSeries&&!document.getElementById('f-series').value)
      document.getElementById('f-series').value=foundSeries;
    else if(foundSeries)
      document.getElementById('f-series').value=foundSeries; // always apply if found
    if(foundNum)
      document.getElementById('f-series-num').value=foundNum;
    var msg='';
    if(foundSeries&&foundNum)msg='Found: '+foundSeries+' #'+foundNum;
    else if(foundSeries)msg='Found series: '+foundSeries+' (number not found)';
    else msg='Found book #'+foundNum;
    status.textContent=msg;
    status.style.color='var(--sage)';
    showToast('Series info found!');
  }else{
    status.textContent='No series info found in any source.';
    status.style.color='var(--rust)';
  }
}

// "Auto-Fill" button handler: the main ISBN/title → full record lookup.
// Cascades through Open Library (ISBN), Google Books (ISBN), then — if the
// input wasn't a valid ISBN, or the ISBN lookup found nothing — a title
// search across Google Books and Open Library, followed by extra summary
// sources (Open Library first_sentence, Inventaire, Wikipedia) and a
// multi-source series lookup for anything still missing. In Edit mode,
// instead of overwriting the form directly it snapshots first and routes
// the result through the lookup-review diff (see lookup-review.js).
async function lookupISBN(){
  var rawInput=document.getElementById('f-isbn').value.trim();
  var isbn=rawInput.replace(/[^0-9X]/gi,'');
  var isTitleSearch=!isbn || !/^(97[89]\d{10}|\d{9}[\dX])$/i.test(isbn);

  // Allow a title fallback: if the input doesn't look like an ISBN, treat it as a title query
  // (also falls through to title search if ISBN lookup finds nothing)
  if(!rawInput){showToast('Enter an ISBN or book title first');return}

  var btn=document.getElementById('lookup-btn'),status=document.getElementById('lookup-status');
  btn.disabled=true;
  btn.textContent='Looking up…';
  status.className='lookup-status';

  // Snapshot current form values if we're in edit mode
  var isEditMode=!!editingId;
  var preSnapshot=isEditMode?snapshotForm():null;

  // Allow genre to be overwritten during lookup so the review dialog can surface conflicts
  _lookupOverrideGenre=true;

  var filled=false;

  // ── 1. OPEN LIBRARY (ISBN path only) ──
  if(!isTitleSearch){
  try{
    var r=await fetch('https://openlibrary.org/api/books?bibkeys=ISBN:'+isbn+'&format=json&jscmd=data');
    var d=await r.json();var key='ISBN:'+isbn;
    if(d[key]){
      var book=d[key];
      if(book.title)document.getElementById('f-title').value=toTitleCase(book.title);
      if(book.authors)document.getElementById('f-author').value=book.authors.map(function(a){return a.name}).join(', ');
      if(book.number_of_pages)document.getElementById('f-pages').value=book.number_of_pages;
      if(book.publishers)document.getElementById('f-publisher').value=book.publishers.map(function(p){return p.name}).join(', ');
      if(book.publish_date){var yr=book.publish_date.match(/\d{4}/);if(yr)document.getElementById('f-year').value=yr[0]}
      if(book.subjects&&book.subjects.length){
        var subjList=book.subjects.slice(0,20).map(function(s){return typeof s==='string'?s:s.name}).filter(Boolean);
        document.getElementById('f-subjects').value=subjList.join(', ');
        trySetGenre(subjList.join(' '));
        inferAgeAndGrade(subjList.join(' '),[],book.number_of_pages||0,'');
      }
      if(book.notes){var note=typeof book.notes==='string'?book.notes:(book.notes.value||'');var cleaned=cleanSummary(note);if(cleaned)document.getElementById('f-desc').value=cleaned;}
      if(book.works&&book.works[0]){
        try{
          status.textContent='Fetching series & summary from Open Library…';
          var wr=await fetch('https://openlibrary.org'+book.works[0].key+'.json');
          var wd=await wr.json();
          if(!document.getElementById('f-desc').value){
            var desc=wd.description;
            if(desc){var txt=typeof desc==='string'?desc:(desc.value||'');var cleaned2=cleanSummary(txt);if(cleaned2)document.getElementById('f-desc').value=cleaned2;}
          }
          // Re-run age inference now that we may have more subjects from works
          if(wd.subjects){
            var wSubj=(wd.subjects||[]).map(function(s){return typeof s==='string'?s:(s.name||s.value||'')}).join(' ');
            inferAgeAndGrade(wSubj,[],book.number_of_pages||0,document.getElementById('f-desc').value);
          }
          if(!document.getElementById('f-series').value&&wd.series&&wd.series.length){
            var rawSeries=wd.series[0];
            var numMatch=rawSeries.match(/#\s*(\d+\.?\d*)|(?:[,\s]+(?:book|vol\.?|volume)?\s*)(\d+\.?\d*)\s*$/i);
            if(numMatch){
              var extractedNum=(numMatch[1]||numMatch[2]).trim();
              var extractedName=rawSeries.replace(/#\s*\d+\.?\d*/,'').replace(/[,\s]+(?:book|vol\.?|volume)?\s*\d+\.?\d*\s*$/i,'').replace(/\s*[,\-]\s*$/,'').trim();
              if(extractedName&&!document.getElementById('f-series').value)document.getElementById('f-series').value=extractedName;
              if(extractedNum&&!document.getElementById('f-series-num').value)document.getElementById('f-series-num').value=extractedNum;
            }else{
              document.getElementById('f-series').value=rawSeries.trim();
            }
          }
        }catch(e){}
      }
      try{
        status.textContent='Loading cover from Open Library…';
        var cr=await fetch('https://covers.openlibrary.org/b/isbn/'+isbn+'-M.jpg');var blob=await cr.blob();
        if(blob.size>1500){var reader=new FileReader();reader.onload=function(ev){document.getElementById('f-cover-url').value=ev.target.result;setCoverPreview(ev.target.result)};reader.readAsDataURL(blob)}
        else{status.textContent='Cover not found in Open Library, trying Google Books…';}
      }catch(e){}
      matchKnownSeries(document.getElementById('f-title').value);
      filled=true;
      status.textContent='✓ Found in Open Library — checking Google Books for more…';status.className='lookup-status success';
    }
  }catch(e){/* CORS blocked from file:// — Google Books will fill in */}

  // ── 2. GOOGLE BOOKS ──
  try{
    if(!filled)status.textContent='Searching Google Books…';
    var gr=await fetch('https://www.googleapis.com/books/v1/volumes?q=isbn:'+isbn+'&maxResults=1');
    var gd=await gr.json();
    if(gd.items&&gd.items[0]){
      var vi=gd.items[0].volumeInfo;
      if(!document.getElementById('f-title').value&&vi.title)document.getElementById('f-title').value=toTitleCase(vi.title);
      if(!document.getElementById('f-subtitle').value&&vi.subtitle)document.getElementById('f-subtitle').value=vi.subtitle;
      if(!document.getElementById('f-author').value&&vi.authors)document.getElementById('f-author').value=vi.authors.join(', ');
      if(!document.getElementById('f-pages').value&&vi.pageCount)document.getElementById('f-pages').value=vi.pageCount;
      if(!document.getElementById('f-publisher').value&&vi.publisher)document.getElementById('f-publisher').value=vi.publisher;
      if(!document.getElementById('f-year').value&&vi.publishedDate){var gyr=vi.publishedDate.match(/\d{4}/);if(gyr)document.getElementById('f-year').value=gyr[0]}
      if(!document.getElementById('f-language').value&&vi.language)document.getElementById('f-language').value=vi.language==='en'?'English':vi.language;
      if(vi.description&&(!document.getElementById('f-desc').value||document.getElementById('f-desc').value.length<100)){
        var gbDesc=cleanSummary(vi.description);
        if(gbDesc)document.getElementById('f-desc').value=gbDesc;
      }
      if(vi.categories&&vi.categories.length&&!document.getElementById('f-subjects').value){
        document.getElementById('f-subjects').value=vi.categories.join(', ');
        trySetGenre(vi.categories.join(' '));
      }
      // Google Books maturityRating + categories → age inference
      var gbMaturity=gd.items[0].volumeInfo.maturityRating||'';
      inferAgeAndGrade(
        document.getElementById('f-subjects').value,
        vi.categories||[],
        vi.pageCount||0,
        document.getElementById('f-desc').value
      );
      // maturityRating=MATURE is a strong Adult signal
      if(gbMaturity==='MATURE'&&!document.getElementById('f-age').value){
        document.getElementById('f-age').value='Adult (18+)';
      }
      var si=gd.items[0].seriesInfo;
      if(si){
        if(si.shortSeriesBookTitle&&!document.getElementById('f-series').value)
          document.getElementById('f-series').value=si.shortSeriesBookTitle;
        if(si.volumeSeries&&si.volumeSeries[0]){
          var orderNum=si.volumeSeries[0].orderNumber||si.volumeSeries[0].issue&&si.volumeSeries[0].issue[0]&&si.volumeSeries[0].issue[0].issueOrderNumber;
          if(orderNum&&!document.getElementById('f-series-num').value)
            document.getElementById('f-series-num').value=orderNum;
        }
      }
      if(!document.getElementById('f-series').value){
        var titleSrc=(vi.title||'')+' '+(vi.subtitle||'');
        extractSeriesFromText(titleSrc);
      }
      if(!document.getElementById('f-series').value){
        var descSrc=document.getElementById('f-desc').value||'';
        extractSeriesFromText(descSrc);
      }
      if(!document.getElementById('f-cover-url').value&&vi.imageLinks){
        var imgUrl=(vi.imageLinks.medium||vi.imageLinks.thumbnail||'').replace('http://','https://');
        if(imgUrl){
          try{
            status.textContent='Loading cover from Google Books…';
            var ir=await fetch(imgUrl);var ib=await ir.blob();
            if(ib.size>1000){var ir2=new FileReader();ir2.onload=function(ev){document.getElementById('f-cover-url').value=ev.target.result;setCoverPreview(ev.target.result)};ir2.readAsDataURL(ib)}
            else{status.textContent='Cover not found — you can upload one manually.';}
          }catch(e){}
        }
      }
      if(!document.getElementById('f-series').value)matchKnownSeries(document.getElementById('f-title').value);
      filled=true;
    }
  }catch(e){}
  } // end !isTitleSearch block

  // ── 1b. TITLE SEARCH — runs when input is a title (not ISBN), or when ISBN found nothing ──
  if(isTitleSearch || !filled){
    try{
      var titleQuery=isTitleSearch ? rawInput.trim() : document.getElementById('f-title').value.trim();
      var titleAuthor=document.getElementById('f-author').value.trim();
      if(!titleQuery){throw new Error('no title');}
      status.textContent='Searching by title…';

      // Google Books title search (best CORS support)
      var tGbQ=encodeURIComponent('intitle:'+titleQuery+(titleAuthor?' inauthor:'+titleAuthor.split(' ').slice(-1)[0]:''));
      var tGbR=await fetch('https://www.googleapis.com/books/v1/volumes?q='+tGbQ+'&maxResults=5&printType=books');
      var tGbD=await tGbR.json();
      if(tGbD.items&&tGbD.items[0]){
        // Pick best match — prefer exact title match
        var tNorm=function(s){return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'')};
        var tQNorm=tNorm(titleQuery);
        var tBest=tGbD.items[0];
        for(var ti=0;ti<tGbD.items.length;ti++){
          var tCand=tGbD.items[ti].volumeInfo||{};
          if(tNorm(tCand.title)===tQNorm||tNorm(tCand.title).includes(tQNorm)){tBest=tGbD.items[ti];break;}
        }
        var tvi=tBest.volumeInfo||{};

        // In title-search mode always overwrite the field (it contains the typed title text);
        // in ISBN-fallback mode only fill if empty
        if(tBest.volumeInfo&&tBest.volumeInfo.industryIdentifiers){
          var ids=tBest.volumeInfo.industryIdentifiers;
          var isbn13=ids.find(function(x){return x.type==='ISBN_13'});
          var isbn10=ids.find(function(x){return x.type==='ISBN_10'});
          var foundIsbn=(isbn13&&isbn13.identifier)||(isbn10&&isbn10.identifier)||'';
          if(foundIsbn&&(isTitleSearch||!document.getElementById('f-isbn').value)){
            document.getElementById('f-isbn').value=foundIsbn;
          }
        }

        // In title-search mode always write title/author (canonical API spelling wins);
        // in ISBN fallback mode only fill if empty
        if(isTitleSearch){
          if(tvi.title)document.getElementById('f-title').value=toTitleCase(tvi.title);
          if(tvi.subtitle&&!document.getElementById('f-subtitle').value)document.getElementById('f-subtitle').value=tvi.subtitle;
          if(tvi.authors)document.getElementById('f-author').value=tvi.authors.join(', ');
        } else {
          if(!document.getElementById('f-title').value&&tvi.title)document.getElementById('f-title').value=toTitleCase(tvi.title);
          if(!document.getElementById('f-subtitle').value&&tvi.subtitle)document.getElementById('f-subtitle').value=tvi.subtitle;
          if(!document.getElementById('f-author').value&&tvi.authors)document.getElementById('f-author').value=tvi.authors.join(', ');
        }
        if(!document.getElementById('f-pages').value&&tvi.pageCount)document.getElementById('f-pages').value=tvi.pageCount;
        if(!document.getElementById('f-publisher').value&&tvi.publisher)document.getElementById('f-publisher').value=tvi.publisher;
        if(!document.getElementById('f-year').value&&tvi.publishedDate){var tyr=tvi.publishedDate.match(/\d{4}/);if(tyr)document.getElementById('f-year').value=tyr[0];}
        if(!document.getElementById('f-language').value&&tvi.language)document.getElementById('f-language').value=tvi.language==='en'?'English':tvi.language;
        if(tvi.description&&(!document.getElementById('f-desc').value||document.getElementById('f-desc').value.length<100)){
          var tDesc=cleanSummary(tvi.description);
          if(tDesc)document.getElementById('f-desc').value=tDesc;
        }
        if(tvi.categories&&tvi.categories.length&&!document.getElementById('f-subjects').value){
          document.getElementById('f-subjects').value=tvi.categories.join(', ');
          trySetGenre(tvi.categories.join(' '));
        }
        var tMaturity=(tBest.volumeInfo||{}).maturityRating||'';
        inferAgeAndGrade(document.getElementById('f-subjects').value,tvi.categories||[],tvi.pageCount||0,document.getElementById('f-desc').value);
        if(tMaturity==='MATURE'&&!document.getElementById('f-age').value)setAgeCombo('Adult (18+)');

        // Series from seriesInfo
        var tsi=tBest.seriesInfo;
        if(tsi&&tsi.shortSeriesBookTitle&&!document.getElementById('f-series').value){
          document.getElementById('f-series').value=tsi.shortSeriesBookTitle;
          if(tsi.volumeSeries&&tsi.volumeSeries[0]&&tsi.volumeSeries[0].orderNumber&&!document.getElementById('f-series-num').value)
            document.getElementById('f-series-num').value=tsi.volumeSeries[0].orderNumber;
        }
        if(!document.getElementById('f-series').value)extractSeriesFromText((tvi.title||'')+' '+(tvi.subtitle||''));
        if(!document.getElementById('f-series').value)matchKnownSeries(tvi.title||'');

        // Cover
        if(!document.getElementById('f-cover-url').value&&tvi.imageLinks){
          var tImgUrl=(tvi.imageLinks.medium||tvi.imageLinks.thumbnail||'').replace('http://','https://');
          if(tImgUrl){
            try{
              status.textContent='Loading cover…';
              var tIr=await fetch(tImgUrl);var tIb=await tIr.blob();
              if(tIb.size>1000){var tIr2=new FileReader();tIr2.onload=function(ev){document.getElementById('f-cover-url').value=ev.target.result;setCoverPreview(ev.target.result)};tIr2.readAsDataURL(tIb);}
            }catch(e){}
          }
        }
        filled=true;
        status.textContent='✓ Found via title search — checking for more details…';status.className='lookup-status success';
      }
    }catch(e){}

    // Open Library title search for fuller metadata
    if(filled||isTitleSearch){
      try{
        var olTitleQ=document.getElementById('f-title').value.trim()||rawInput.trim();
        var olTitleAuth=document.getElementById('f-author').value.trim();
        if(olTitleQ){
          var olTq=encodeURIComponent(olTitleQ+(olTitleAuth?' '+olTitleAuth.split(' ').slice(-1)[0]:''));
          var olTr=await fetch('https://openlibrary.org/search.json?q='+olTq+'&fields=key,title,author_name,isbn,number_of_pages_median,publisher,first_publish_year,subject,series,first_sentence,cover_i&limit=5');
          var olTd=await olTr.json();
          if(olTd.docs&&olTd.docs[0]){
            var tNorm2=function(s){return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'')};
            var olTitleNorm=tNorm2(olTitleQ);
            var olBest=olTd.docs[0];
            for(var oli=0;oli<olTd.docs.length;oli++){
              if(tNorm2(olTd.docs[oli].title)===olTitleNorm){olBest=olTd.docs[oli];break;}
            }
            // In title-search mode overwrite the ISBN field (it currently holds the typed title);
            // in fallback mode only fill if still empty
            if(olBest.isbn&&olBest.isbn.length){
              var olIsbn=olBest.isbn.find(function(x){return x.length===13})||olBest.isbn[0];
              if(olIsbn&&(isTitleSearch||!document.getElementById('f-isbn').value)){
                document.getElementById('f-isbn').value=olIsbn;
              }
            }
            // Title / author — always write in title-search mode, fill-if-empty otherwise
            if(isTitleSearch){
              if(olBest.title&&!document.getElementById('f-title').value)document.getElementById('f-title').value=toTitleCase(olBest.title);
              if(olBest.author_name&&olBest.author_name.length&&!document.getElementById('f-author').value)document.getElementById('f-author').value=olBest.author_name[0];
            }
            if(!document.getElementById('f-pages').value&&olBest.number_of_pages_median)document.getElementById('f-pages').value=olBest.number_of_pages_median;
            if(!document.getElementById('f-publisher').value&&olBest.publisher&&olBest.publisher[0])document.getElementById('f-publisher').value=olBest.publisher[0];
            if(!document.getElementById('f-year').value&&olBest.first_publish_year)document.getElementById('f-year').value=olBest.first_publish_year;
            if(olBest.subject&&olBest.subject.length&&!document.getElementById('f-subjects').value){
              document.getElementById('f-subjects').value=olBest.subject.slice(0,15).join(', ');
              trySetGenre(olBest.subject.join(' '));
            }
            if(!document.getElementById('f-desc').value&&olBest.first_sentence){
              var olFs=typeof olBest.first_sentence==='string'?olBest.first_sentence:(olBest.first_sentence.value||'');
              var olFsCleaned=cleanSummary(olFs);
              if(olFsCleaned&&olFsCleaned.length>60)document.getElementById('f-desc').value=olFsCleaned;
            }
            if(!document.getElementById('f-series').value&&olBest.series&&olBest.series.length){
              var olSr=olBest.series[0];
              var olNm=olSr.match(/#\s*(\d+\.?\d*)|(?:[,\s]+(?:book|vol\.?|volume)?\s*)(\d+\.?\d*)\s*$/i);
              if(olNm){
                var olEn=(olNm[1]||olNm[2]||'').trim();
                var olEname=olSr.replace(/#\s*\d+\.?\d*/,'').replace(/[,\s]+(?:book|vol\.?|volume)?\s*\d+\.?\d*\s*$/i,'').replace(/\s*[,\-]\s*$/,'').trim();
                if(olEname)document.getElementById('f-series').value=olEname;
                if(olEn&&!document.getElementById('f-series-num').value)document.getElementById('f-series-num').value=olEn;
              }else{document.getElementById('f-series').value=olSr.trim();}
            }
            // OL cover (as base64)
            if(!document.getElementById('f-cover-url').value&&olBest.cover_i){
              try{
                var olCr=await fetch('https://covers.openlibrary.org/b/id/'+olBest.cover_i+'-M.jpg');var olCb=await olCr.blob();
                if(olCb.size>1500){var olCrdr=new FileReader();olCrdr.onload=function(ev){document.getElementById('f-cover-url').value=ev.target.result;setCoverPreview(ev.target.result)};olCrdr.readAsDataURL(olCb);}
              }catch(e){}
            }
            inferAgeAndGrade(document.getElementById('f-subjects').value,[],document.getElementById('f-pages').value||0,document.getElementById('f-desc').value);
            filled=true;
          }
        }
      }catch(e){}
    }
  } // end title-search block

  // ── 3. OPEN LIBRARY search — first_sentence field (often a synopsis snippet) ──
  if(!document.getElementById('f-desc').value){
    try{
      var olTitle=document.getElementById('f-title').value.trim();
      var olAuth=document.getElementById('f-author').value.trim();
      if(olTitle){
        status.textContent='Checking Open Library for summary…';
        var olSq=encodeURIComponent(olTitle+(olAuth?' '+olAuth.split(' ').slice(-1)[0]:''));
        var olSr=await fetch('https://openlibrary.org/search.json?q='+olSq+'&fields=key,title,first_sentence&limit=5');
        var olSd=await olSr.json();
        if(olSd.docs){
          for(var ofs=0;ofs<olSd.docs.length;ofs++){
            var ofsDoc=olSd.docs[ofs];
            var ofsText=ofsDoc.first_sentence;
            if(ofsText){
              var ofsStr=typeof ofsText==='string'?ofsText:(ofsText.value||'');
              var ofsCleaned=cleanSummary(ofsStr);
              if(ofsCleaned&&ofsCleaned.length>60){
                document.getElementById('f-desc').value=ofsCleaned;
                break;
              }
            }
          }
        }
      }
    }catch(e){}
  }

  // ── 4. INVENTAIRE — descriptions field (fuller than labels) ──
  if(!document.getElementById('f-desc').value){
    try{
      status.textContent='Checking Inventaire for summary…';
      var ivr=await fetch('https://inventaire.io/api/entities?action=by-uris&uris=isbn:'+isbn);
      var ivd=await ivr.json();
      if(ivd.entities){
        var ivkeys=Object.keys(ivd.entities);
        if(ivkeys.length){
          var ive=ivd.entities[ivkeys[0]];
          // Try descriptions first (richer), then labels
          var ivText='';
          if(ive.descriptions){
            ivText=ive.descriptions['en']||ive.descriptions[Object.keys(ive.descriptions)[0]]||'';
          }
          if(!ivText&&ive.labels){
            ivText=ive.labels['en']||ive.labels[Object.keys(ive.labels)[0]]||'';
          }
          var ivCleaned=cleanSummary(ivText);
          if(ivCleaned&&ivCleaned.length>80)document.getElementById('f-desc').value=ivCleaned;
        }
      }
    }catch(e){}
  }

  // ── 5. WIKIPEDIA — search then fetch page summary ──
  if(!document.getElementById('f-desc').value){
    try{
      var wTitle=document.getElementById('f-title').value.trim();
      var wAuthor=document.getElementById('f-author').value.trim();
      if(wTitle){
        status.textContent='Searching Wikipedia for summary…';
        // Step A: search Wikipedia for the best matching article title
        var wQuery=encodeURIComponent(wTitle+(wAuthor?' '+wAuthor.split(' ')[0]:''));
        var wSearch=await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+wQuery+'&srlimit=5&srprop=snippet&format=json&origin=*');
        var wsd=await wSearch.json();
        if(wsd.query&&wsd.query.search&&wsd.query.search.length){
          // Pick the result whose title most closely matches the book title
          var wNorm=function(s){return s.toLowerCase().replace(/[^a-z0-9]/g,'')};
          var wTitleNorm=wNorm(wTitle);
          var wBest=null;
          for(var wi=0;wi<wsd.query.search.length;wi++){
            var wHit=wsd.query.search[wi];
            var wHitNorm=wNorm(wHit.title);
            // Prefer exact or near-exact title match
            if(wHitNorm===wTitleNorm||wHitNorm.includes(wTitleNorm)||wTitleNorm.includes(wHitNorm)){
              wBest=wHit.title;break;
            }
          }
          // Fallback to top result if no close match
          if(!wBest)wBest=wsd.query.search[0].title;
          // Step B: fetch the clean Wikipedia summary for that article
          status.textContent='Loading summary from Wikipedia…';
          var wSum=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(wBest));
          var wSumData=await wSum.json();
          if(wSumData.extract&&wSumData.extract.length>100){
            // Only use if the extract actually mentions the book title or author
            var wExtNorm=wNorm(wSumData.extract);
            var wAuthorLast=(wAuthor||'').split(' ').pop();
            if(wExtNorm.includes(wTitleNorm)||wExtNorm.includes(wNorm(wAuthorLast))){
              document.getElementById('f-desc').value=cleanSummary(wSumData.extract);
            }
          }
        }
      }
    }catch(e){}
  }

  // ── Final age/grade pass — use everything we now have ──
  inferAgeAndGrade(
    document.getElementById('f-subjects').value,
    [],
    document.getElementById('f-pages').value||0,
    document.getElementById('f-desc').value
  );

  // ── 6. SERIES: multi-source title search ──
  if(!document.getElementById('f-series').value){
    var lookupTitle=document.getElementById('f-title').value.trim();
    var lookupAuthor=document.getElementById('f-author').value.trim();
    if(lookupTitle){
      // 4a. Open Library search — has series field on results
      try{
        status.textContent='Searching Open Library for series info…';
        var olq=encodeURIComponent(lookupTitle+(lookupAuthor?' '+lookupAuthor.split(' ').slice(-1)[0]:''));
        var olsr=await fetch('https://openlibrary.org/search.json?q='+olq+'&fields=key,title,series&limit=5');
        var olsd=await olsr.json();
        if(olsd.docs){
          for(var oi=0;oi<olsd.docs.length;oi++){
            var doc=olsd.docs[oi];
            if(doc.series&&doc.series.length&&!document.getElementById('f-series').value){
              var rs=doc.series[0];
              var nm=rs.match(/#\s*(\d+\.?\d*)|(?:[,\s]+(?:book|vol\.?|volume)?\s*)(\d+\.?\d*)\s*$/i);
              if(nm){
                var en=(nm[1]||nm[2]||'').trim();
                var ename=rs.replace(/#\s*\d+\.?\d*/,'').replace(/[,\s]+(?:book|vol\.?|volume)?\s*\d+\.?\d*\s*$/i,'').replace(/\s*[,\-]\s*$/,'').trim();
                if(ename)document.getElementById('f-series').value=ename;
                if(en&&!document.getElementById('f-series-num').value)document.getElementById('f-series-num').value=en;
              }else{
                document.getElementById('f-series').value=rs.trim();
              }
              break;
            }
          }
        }
      }catch(e){}

      // 4b. Google Books title search
      if(!document.getElementById('f-series').value){
        try{
          status.textContent='Searching Google Books for series info…';
          var gbq=encodeURIComponent('intitle:'+lookupTitle+(lookupAuthor?' inauthor:'+lookupAuthor.split(' ').slice(-1)[0]:''));
          var sr=await fetch('https://www.googleapis.com/books/v1/volumes?q='+gbq+'&maxResults=8&printType=books');
          var sd=await sr.json();
          if(sd.items){
            for(var si2=0;si2<sd.items.length;si2++){
              var svi=sd.items[si2].volumeInfo||{};
              var fullTitle=(svi.title||'')+' '+(svi.subtitle||'');
              var ssi=sd.items[si2].seriesInfo;
              if(ssi&&ssi.shortSeriesBookTitle&&!document.getElementById('f-series').value){
                document.getElementById('f-series').value=ssi.shortSeriesBookTitle;
                if(ssi.volumeSeries&&ssi.volumeSeries[0]&&ssi.volumeSeries[0].orderNumber&&!document.getElementById('f-series-num').value)
                  document.getElementById('f-series-num').value=ssi.volumeSeries[0].orderNumber;
                break;
              }
              if(extractSeriesFromText(fullTitle))break;
            }
          }
        }catch(e){}
      }

      // 4c. Wikipedia series lookup — search for "Title (novel)" or "Title (book)"
      // then scan the infobox/categories for series name and book number
      if(!document.getElementById('f-series').value||!document.getElementById('f-series-num').value){
        try{
          status.textContent='Checking Wikipedia for series info…';
          var wSeriesQ=encodeURIComponent(lookupTitle+(lookupAuthor?' '+lookupAuthor.split(' ').slice(-1)[0]:''));
          var wSeriesSearch=await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+wSeriesQ+'&srlimit=5&srprop=snippet&format=json&origin=*');
          var wSeriesD=await wSeriesSearch.json();
          if(wSeriesD.query&&wSeriesD.query.search&&wSeriesD.query.search.length){
            var wNorm2=function(s){return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');};
            var wTN=wNorm2(lookupTitle);
            var wBestTitle=null;
            for(var wsi=0;wsi<wSeriesD.query.search.length;wsi++){
              var wHit=wSeriesD.query.search[wsi];
              var wHN=wNorm2(wHit.title);
              if(wHN===wTN||wHN.includes(wTN)||wTN.includes(wHN)){wBestTitle=wHit.title;break;}
            }
            if(!wBestTitle)wBestTitle=wSeriesD.query.search[0].title;
            // Fetch the full wikitext (action=raw) to parse infobox fields
            var wRaw=await fetch('https://en.wikipedia.org/w/api.php?action=query&titles='+encodeURIComponent(wBestTitle)+'&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*');
            var wRawD=await wRaw.json();
            var wPages=wRawD.query&&wRawD.query.pages;
            if(wPages){
              var wPageId=Object.keys(wPages)[0];
              var wText=(wPages[wPageId].revisions&&wPages[wPageId].revisions[0]&&
                (wPages[wPageId].revisions[0]['*']||
                 (wPages[wPageId].revisions[0].slots&&wPages[wPageId].revisions[0].slots.main&&wPages[wPageId].revisions[0].slots.main['*'])))||'';
              if(wText){
                // Extract series from infobox: |series = ... or |preceded_by
                var seriesMatch=wText.match(/\|\s*series\s*=\s*\[\[([^\]|]+)/i)||
                                wText.match(/\|\s*series\s*=\s*([^\|\]]{3,60})/i);
                if(seriesMatch&&!document.getElementById('f-series').value){
                  var wSeriesName=seriesMatch[1].replace(/\[\[|\]\]/g,'').replace(/\|.*/,'').trim();
                  if(wSeriesName&&wSeriesName.length>2)
                    document.getElementById('f-series').value=wSeriesName;
                }
                // Extract book number: |preceded_by or |number or infobox "preceded by"
                if(!document.getElementById('f-series-num').value){
                  var numMatch=wText.match(/\|\s*number\s*=\s*(\d+\.?\d*)/i)||
                               wText.match(/book\s+(?:no\.?|number|#)?\s*(\d+\.?\d*)/i)||
                               wText.match(/#(\d+\.?\d*)\s+(?:in|of)\s+the/i);
                  if(numMatch)document.getElementById('f-series-num').value=numMatch[1];
                }
              }
            }
          }
        }catch(e){}
      }
    }
  }

  if(!filled){
    status.textContent='Not found in any database. Fill in manually or use the Search button.';
    status.className='lookup-status error';
    btn.disabled=false;btn.textContent='Auto-Fill';
    _lookupOverrideGenre=false;
  }else{
    var hasSeries=document.getElementById('f-series').value;
    var hasDesc=document.getElementById('f-desc').value;
    var hasCover=document.getElementById('f-cover-url').value;
    var hasAge=document.getElementById('f-age').value;
    var hasGrade=document.getElementById('f-grade').value;
    var parts=['✓ Lookup complete'];
    if(hasSeries)parts.push('series detected');
    if(hasAge)parts.push('age range: '+hasAge.replace(/ \(Ages.+\)/,''));
    if(hasGrade)parts.push(hasGrade);
    if(hasDesc)parts.push('summary found');else parts.push('no summary found');
    if(!hasCover)parts.push('no cover — upload manually');
    status.textContent=parts.join(' · ');
    status.className='lookup-status success';
    btn.disabled=false;btn.textContent='Auto-Fill';
    _lookupOverrideGenre=false; // restore guard for normal form interaction

    // In edit mode: snapshot the new values, restore the original, then show the review dialog
    if(isEditMode && preSnapshot){
      var postSnapshot=snapshotForm();
      restoreSnapshot(preSnapshot);
      openLookupReview(preSnapshot, postSnapshot);
    }
  }
}
