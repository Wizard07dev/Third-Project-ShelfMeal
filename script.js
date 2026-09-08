(function(){
  var views = {
    '/': 'view-home',
    '/app': 'view-app',
    '/privacy': 'view-privacy',
    '/terms': 'view-terms'
  };

  function route(){
    var hash = window.location.hash.replace('#','') || '/';
    var id = views[hash] || 'view-home';
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('[data-nav]').forEach(function(a){
      a.classList.toggle('active', a.getAttribute('data-nav') === hash);
    });
    window.scrollTo(0,0);
  }
  window.addEventListener('hashchange', route);
  route();

  /* ---------- mobile nav ---------- */
  var navEl = document.getElementById('mainNav');
  var menuBtn = document.getElementById('menuBtn');
  menuBtn.addEventListener('click', function(){
    var isOpen = navEl.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  navEl.addEventListener('click', function(e){
    if(e.target.tagName === 'A'){
      navEl.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- pantry state ---------- */
  var scannedItems = [];

  function renderChips(){
    var wrap = document.getElementById('chips');
    wrap.innerHTML = '';
    scannedItems.forEach(function(item, idx){
      var chip = document.createElement('div');
      chip.className = 'chip';
      var span = document.createElement('span');
      span.textContent = item;
      var btn = document.createElement('button');
      btn.textContent = '\u00D7';
      btn.setAttribute('aria-label', 'Remove ' + item);
      btn.onclick = function(){
        scannedItems.splice(idx,1);
        renderChips();
      };
      chip.appendChild(span);
      chip.appendChild(btn);
      wrap.appendChild(chip);
    });
  }

  function fileToBase64(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result.split(',')[1]); };
      reader.onerror = function(){ reject(new Error('Could not read that file.')); };
      reader.readAsDataURL(file);
    });
  }

  async function callClaude(messages, extraOptions){
    var body = Object.assign({
      max_tokens: 1000,
      messages: messages
    }, extraOptions || {});
    var res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json().catch(function(){ return {}; });
    if(!res.ok){
      throw new Error((data && data.error) ? data.error : ('did not respond, status ' + res.status));
    }
    var text = (data.content || [])
      .map(function(block){ return block.type === 'text' ? block.text : ''; })
      .join('\n')
      .trim();
    return text;
  }

  document.getElementById('scanBtn').addEventListener('click', async function(){
    var fileInput = document.getElementById('photoInput');
    var file = fileInput.files[0];
    if(!file){
      alert('Choose a photo first.');
      return;
    }
    var btn = document.getElementById('scanBtn');
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Reading...';
    try{
      var base64 = await fileToBase64(file);
      var mediaType = file.type || 'image/jpeg';
      var text = await callClaude([{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'List the distinct food items visible in this photo of a pantry, fridge, or shelf. Reply with only a comma-separated list of items, lowercase, no other text. If you cannot identify any food items, reply with the single word: none.' }
        ]
      }]);
      if(text.toLowerCase() === 'none' || !text){
        alert('Could not make out any food items in that photo. Try a clearer shot, or type your items instead.');
      } else {
        var items = text.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
        items.forEach(function(item){
          if(scannedItems.indexOf(item) === -1) scannedItems.push(item);
        });
        renderChips();
      }
    }catch(err){
      alert(err.message || 'Something went wrong reading that photo.');
    }finally{
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  function parseTypedItems(raw){
    return raw.split(/[\n,]/).map(function(s){ return s.trim(); }).filter(Boolean);
  }

  function renderLoading(){
    document.getElementById('resultArea').innerHTML =
      '<div class="loading-box">Working out what you can make. This takes a few seconds.</div>';
  }

  function renderError(msg){
    document.getElementById('resultArea').innerHTML =
      '<div class="error-box">' + msg + '</div>';
  }

  function escapeHtml(str){
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function renderResult(meal){
    var ingredientsHtml = (meal.ingredients_used || []).map(function(i){
      return '<li>' + escapeHtml(i) + '</li>';
    }).join('');
    var stepsHtml = (meal.steps || []).map(function(s){
      return '<li>' + escapeHtml(s) + '</li>';
    }).join('');
    var buyHtml = '';
    if(meal.to_buy && meal.to_buy.length){
      buyHtml = '<div class="buy-note">Worth buying: ' + meal.to_buy.map(escapeHtml).join(', ') + '</div>';
    }
    document.getElementById('resultArea').innerHTML =
      '<div class="result-card">' +
        '<h3>' + escapeHtml(meal.name) + '</h3>' +
        '<div class="meta">' + escapeHtml(meal.time || '') + (meal.time && meal.servings ? ' \u00B7 ' : '') + escapeHtml(meal.servings || '') + '</div>' +
        (meal.why ? '<div class="why">' + escapeHtml(meal.why) + '</div>' : '') +
        '<h4>Ingredients</h4>' +
        '<ul class="ing">' + ingredientsHtml + '</ul>' +
        buyHtml +
        '<h4>Steps</h4>' +
        '<ol class="steps">' + stepsHtml + '</ol>' +
      '</div>';
  }

  document.getElementById('generateBtn').addEventListener('click', async function(){
    var typed = parseTypedItems(document.getElementById('pantryInput').value);
    var allItems = typed.concat(scannedItems);
    if(allItems.length === 0){
      alert('List at least a few items first.');
      return;
    }
    var budget = document.getElementById('budgetInput').value;
    var diet = document.getElementById('dietInput').value.trim();

    var btn = document.getElementById('generateBtn');
    btn.disabled = true;
    renderLoading();

    var prompt =
      'You are a practical home cooking assistant. A user has these items available: ' + allItems.join(', ') + '.\n' +
      'Budget for buying anything extra: ' + (budget ? ('$' + budget) : 'none, use only what is listed') + '.\n' +
      (diet ? ('Avoid: ' + diet + '.\n') : '') +
      'Suggest exactly one realistic meal using mostly the listed items. Reply with only valid JSON, no other text, no markdown fences, matching this shape: ' +
      '{"name": string, "time": string like "20 minutes", "servings": string like "2 servings", "why": string, one sentence on why this fits what they have, "ingredients_used": array of strings, "to_buy": array of strings (empty array if nothing needed, respect the stated budget), "steps": array of strings, 3 to 7 short steps}';

    try{
      var text = await callClaude([{ role: 'user', content: prompt }]);
      var clean = text.replace(/```json/g,'').replace(/```/g,'').trim();
      var meal = JSON.parse(clean);
      renderResult(meal);
    }catch(err){
      renderError(err.message || 'Something went wrong putting a meal together. Try again.');
    }finally{
      btn.disabled = false;
    }
  });
})();
