// ============================================================================
// cover-search.js — #photo-modal: "Search Web for Cover Artwork"
//
// A standalone cover finder separate from the main ISBN auto-fill — lets the
// user search by title/author/ISBN and pick from a grid of candidate cover
// images pulled from Google Books and Open Library.
//
// Depends on: utils.js (esc), modals.js (setCoverPreview, showToast)
// Used by:    index.html "🔍 Search Web for Cover Artwork" button
//             (opens #photo-modal, calls openPhotoModal)
// ============================================================================

function openPhotoModal(){
  document.getElementById('photo-results').innerHTML='';
  document.getElementById('photo-search-input').value=document.getElementById('f-title').value;
  document.getElementById('photo-modal').classList.add('open');
}
function closePhotoModal(){document.getElementById('photo-modal').classList.remove('open')}

// Searches Google Books (reliable CORS, works from file://) and Open Library
// (best-effort — silently skipped if CORS blocks it) and renders a grid of
// clickable cover thumbnails.
async function photoSearch(){
  var q=document.getElementById('photo-search-input').value.trim();
  var res=document.getElementById('photo-results');
  var btn=document.getElementById('photo-search-btn');
  if(!q)return;
  res.innerHTML='<div style="font-size:13px;color:var(--ink-faint);padding:6px 0">Searching cover repositories…</div>';
  btn.disabled=true;btn.textContent='...';
  var results=[];
  try{
    // Google Books: full CORS support, works from file://
    var gbSearchBase='https://www.googleapis.com/books/v1/volumes?q='+encodeURIComponent(q)+'&maxResults=8';
    var gr=await fetch(gbSearchBase);
    var gd=await gr.json();
    if(gd.items){
      gd.items.forEach(function(item){
        var vi=item.volumeInfo||{};
        if(vi.imageLinks&&(vi.imageLinks.thumbnail||vi.imageLinks.smallThumbnail)){
          var img=(vi.imageLinks.thumbnail||vi.imageLinks.smallThumbnail).replace('http://','https://');
          results.push({title:vi.title,author:(vi.authors||[]).join(', '),url:img});
        }
      });
    }
    // Open Library search: may fail from file:// due to CORS, silently ignored
    try{
      var olSearchBase='https://openlibrary.org/search.json?q='+encodeURIComponent(q)+'&limit=6&fields=key,title,author_name,isbn,cover_i';
      var r=await fetch(olSearchBase);
      var d=await r.json();
      if(d.docs&&d.docs.length){
        d.docs.forEach(function(doc){
          if(doc.cover_i)results.push({title:doc.title,author:(doc.author_name||[]).join(', '),url:'https://covers.openlibrary.org/b/id/'+doc.cover_i+'-L.jpg'});
        });
      }
    }catch(olErr){/* Open Library CORS may fail from file:// — GB results still shown */}
    if(gd.items){
      gd.items.forEach(function(item){
        var vi=item.volumeInfo||{};
        if(vi.imageLinks&&(vi.imageLinks.thumbnail||vi.imageLinks.smallThumbnail)){
          var img=(vi.imageLinks.thumbnail||vi.imageLinks.smallThumbnail).replace('http://','https://');
          results.push({title:vi.title,author:(vi.authors||[]).join(', '),url:img});
        }
      });
    }
    if(!results.length){res.innerHTML='<div style="font-size:13px;color:var(--rust)">No cover results found.</div>';return}
    res.innerHTML='<div style="font-size:11px;color:var(--ink-faint);margin-bottom:7px">Click on an image to select cover:</div>'+
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-height:280px;overflow-y:auto;padding-right:4px">'+
      results.map(function(item){
        return '<div style="cursor:pointer;border:1px solid var(--border);padding:4px;background:var(--surface);text-align:center" onclick="selectOnlineCover(\''+encodeURIComponent(item.url)+'\')">'+
               '<img src="'+esc(item.url)+'" style="width:100%;height:94px;object-fit:cover;margin-bottom:3px">'+
               '<div style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500">'+esc(item.title)+'</div></div>';
      }).join('')+'</div>';
  }catch(e){
    res.innerHTML='<div style="font-size:13px;color:var(--rust)">Search failure.</div>';
  }finally{btn.disabled=false;btn.textContent='Search'}
}

function selectOnlineCover(encUrl){
  var url=decodeURIComponent(encUrl);
  document.getElementById('f-cover-url').value=url;
  setCoverPreview(url);
  closePhotoModal();
  showToast('Cover selected ✓');
}
