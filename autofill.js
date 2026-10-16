// ============================================================================
// autofill.js — heuristics for turning raw API lookup data into form fields
//
// These are the "smart fill" helpers used after an ISBN/title lookup (see
// api.js, not yet ported) to guess Genre, Age Range, and Grade Level from
// subject/category text, and to clean up publisher descriptions before they
// land in the Summary field.
//
// Depends on: genre-fields.js (updateSubgenreOptions, setAgeCombo)
// Used by:    api.js (TODO) during ISBN/title auto-fill
// ============================================================================

// Only writes into a field if it's currently empty — used so auto-fill never
// clobbers something the user already typed.
function fillBetter(id, val) {
  var el = document.getElementById(id);
  if (!el || el.value.trim()) return false;
  el.value = val;
  return true;
}

// Merges new comma-separated values into an existing comma-separated field
// (e.g. Subjects/Keywords), skipping anything already present (case-insensitive).
function mergeList(id, arr) {
  var el = document.getElementById(id);
  if (!el || !arr || !arr.length) return false;
  var existing = el.value.split(',').map(function(x) { return x.trim().toLowerCase(); }).filter(Boolean);
  var toAdd = arr.filter(function(v) { return v && v.trim() && !existing.includes(v.trim().toLowerCase()); });
  if (!toAdd.length) return false;
  el.value = (el.value ? el.value + ', ' : '') + toAdd.join(', ');
  return true;
}

// ── Genre detection from Open Library subject strings ───────────────────────
var OL_GENRE_MAP = [
  { terms: ['picture book', 'picture books', 'board book', 'easy readers', 'early readers'], genre: 'Picture Book' },
  { terms: ['fantasy', 'magic', 'wizards', 'witches', 'dragons', 'mythology'], genre: 'Fantasy' },
  { terms: ['science fiction', 'space opera', 'cyberpunk', 'dystopian', 'time travel'], genre: 'Science Fiction' },
  { terms: ['detective', 'mystery', 'whodunit', 'murder mystery', 'crime fiction'], genre: 'Mystery' },
  { terms: ['thriller', 'suspense', 'espionage', 'spy stories', 'psychological fiction'], genre: 'Thriller' },
  { terms: ['love stories', 'romance fiction', 'romantic'], genre: 'Romance' },
  { terms: ['horror tales', 'ghost stories', 'occult fiction', 'gothic'], genre: 'Horror' },
  { terms: ['historical fiction', 'historical novel', 'war stories', 'world war'], genre: 'Historical Fiction' },
  { terms: ['biography', 'autobiography', 'memoir'], genre: 'Biography' },
  { terms: ['self-help', 'self-improvement', 'productivity', 'habits'], genre: 'Non-Fiction' },
  { terms: ['realistic fiction', 'contemporary fiction', 'coming-of-age', 'school story', 'juvenile fiction', "children's fiction", 'family life', 'friendship stories', 'sports stories'], genre: 'Realistic Fiction' }
];

function detectGenre(subjStr) {
  if (!subjStr) return null;
  var lower = subjStr.toLowerCase();
  for (var i = 0; i < OL_GENRE_MAP.length; i++) {
    for (var j = 0; j < OL_GENRE_MAP[i].terms.length; j++) {
      if (lower.includes(OL_GENRE_MAP[i].terms[j])) return OL_GENRE_MAP[i].genre;
    }
  }
  return null;
}

// Set true (by api.js) for the duration of a lookup so genre is always
// overwritten with the detected value, rather than only filling empty fields.
var _lookupOverrideGenre = false;

function trySetGenre(subjStr) {
  // In add mode: only fill if empty. In lookup mode (override): always write.
  if (!_lookupOverrideGenre && document.getElementById('f-genre').value) return false;
  var g = detectGenre(subjStr);
  if (g) { document.getElementById('f-genre').value = g; updateSubgenreOptions(); return true; }
  return false;
}

// ── Age range & grade inference from subjects/categories/pages/description ──
var AGE_RULES = [
  // Board / Picture books
  { age: 'Pre-K (Ages 0–4)', grade: '', terms: ['board book', 'baby book', 'toddler', 'ages 2', 'ages 3', 'ages 0', 'ages 1', 'baby and toddler', 'babys first', 'lift the flap', 'touch and feel', 'nursery rhyme'], pages: [0, 48] },
  // Picture books (slightly older)
  { age: 'Pre-K (Ages 0–4)', grade: 'Pre-K', terms: ['picture book', 'picture books', 'ages 4', 'preschool', 'kindergarten readiness', 'bedtime story'] },
  // Early reader
  { age: 'Early Reader (Ages 5–8)', grade: 'Grades K–2', terms: ['easy reader', 'early reader', 'beginning reader', 'i can read', 'step into reading', 'level 1 reader', 'level 2 reader', 'ages 5', 'ages 6', 'ages 7', 'grades 1', 'grades 2', 'grade 1', 'grade 2', 'first grade', 'second grade', 'kindergarten', 'phonics', 'sight words', 'leveled reader'] },
  // Middle grade
  { age: 'Middle Grade (Ages 8–12)', grade: 'Grades 3–6', terms: ['middle grade', 'middle-grade', 'ages 8', 'ages 9', 'ages 10', 'ages 11', 'grades 3', 'grades 4', 'grades 5', 'grades 6', 'grade 3', 'grade 4', 'grade 5', 'grade 6', 'third grade', 'fourth grade', 'fifth grade', 'sixth grade', 'juvenile fiction', 'juvenile literature', 'childrens fiction', 'children\'s books', 'children\'s fiction', 'ages 8-12', 'ages 8 to 12', '8-12', '8 to 12'] },
  // Young adult
  { age: 'Young Adult (Ages 13–17)', grade: 'Grades 7–12', terms: ['young adult', 'ya fiction', 'ya novel', 'teen fiction', 'teenage', 'ages 12', 'ages 13', 'ages 14', 'ages 15', 'ages 16', 'grades 7', 'grades 8', 'grades 9', 'grades 10', 'grade 7', 'grade 8', 'grade 9', 'high school', 'middle school', 'ya lit', 'young-adult'] },
  // Adult
  { age: 'Adult (18+)', grade: '', terms: ['adult fiction', 'adult nonfiction', 'general fiction', 'literary fiction', 'adult literature', 'for adults', 'trade fiction', 'trade paperback fiction'] }
];

// Page-count heuristics (used as tiebreaker when no subject match)
var PAGE_AGE = [
  { max: 48, age: 'Pre-K (Ages 0–4)', grade: 'Pre-K' },
  { max: 96, age: 'Early Reader (Ages 5–8)', grade: 'Grades K–2' },
  { max: 250, age: 'Middle Grade (Ages 8–12)', grade: 'Grades 3–6' },
  { max: 400, age: 'Young Adult (Ages 13–17)', grade: 'Grades 7–12' }
];

function inferAgeAndGrade(subjects, categories, pages, description) {
  // Only fill if not already set
  var ageEl = document.getElementById('f-age');
  var gradeEl = document.getElementById('f-grade');
  if (ageEl.value && gradeEl.value) return false;

  var corpus = [subjects || '', (categories || []).join(' '), description || ''].join(' ').toLowerCase()
    .replace(/['']/g, "'");

  // Score each rule
  var best = null, bestScore = 0;
  for (var i = 0; i < AGE_RULES.length; i++) {
    var rule = AGE_RULES[i];
    var score = 0;
    for (var j = 0; j < rule.terms.length; j++) {
      if (corpus.includes(rule.terms[j])) score += (j < 4 ? 4 : 1); // weight top terms higher
    }
    // Page-count bonus: only apply if no hard subject match yet
    if (rule.pages && pages) {
      var p = parseInt(pages) || 0;
      if (p > 0 && p >= rule.pages[0] && p <= rule.pages[1]) score += 2;
    }
    if (score > bestScore) { bestScore = score; best = rule; }
  }

  // Page count fallback if no subject match at all
  if (!best && pages) {
    var p2 = parseInt(pages) || 0;
    if (p2 > 0) {
      for (var k = 0; k < PAGE_AGE.length; k++) {
        if (p2 <= PAGE_AGE[k].max) { best = PAGE_AGE[k]; break; }
      }
      if (!best) best = { age: 'Adult (18+)', grade: '' };
    }
  }

  if (best) {
    if (!ageEl.value) { ageEl.value = best.age; setAgeCombo(best.age); }
    if (!gradeEl.value && best.grade) gradeEl.value = best.grade;
    return true;
  }
  return false;
}

// ── Clean up raw API descriptions ────────────────────────────────────────────
function cleanSummary(raw) {
  if (!raw) return '';
  var s = raw
    // strip HTML tags
    .replace(/<[^>]+>/g, ' ')
    // decode common HTML entities
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    // remove "[source]" / "[1]" style citations
    .replace(/\[\d+\]/g, '').replace(/\[[^\]]{0,40}\]/g, '')
    // strip leading boilerplate publisher phrases
    .replace(/^(product description|from the publisher|editorial review|synopsis|summary|description|back cover)[:\s]*/i, '')
    .replace(/^(booklist|starred review|kirkus|publishers weekly|school library journal)[:\s].+?[\r\n]/gi, '')
    // Wikipedia: strip trailing "== References ==" sections that sometimes bleed in
    .replace(/==\s*references\s*==.*/i, '')
    // collapse extra whitespace / newlines
    .replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Truncate at sentence boundary near 800 chars
  if (s.length > 820) {
    var cut = s.lastIndexOf('.', 800);
    if (cut > 400) s = s.slice(0, cut + 1); else s = s.slice(0, 800) + '…';
  }
  return s;
}

// ── Known children's series title→series+number map ─────────────────────────
// Titles are lowercase for case-insensitive matching.
var KNOWN_SERIES=[
  // Magic Tree House (#1-28)
  {s:'Magic Tree House',titles:{
    'dinosaurs before dark':1,'the knight at dawn':2,'mummies in the morning':3,
    'pirates past noon':4,'night of the ninjas':5,'afternoon on the amazon':6,
    'sunset of the sabertooth':7,'midnight on the moon':8,'dolphins at daybreak':9,
    'ghost town at sundown':10,'lions at lunchtime':11,'polar bears past bedtime':12,
    'vacation under the volcano':13,'day of the dragon king':14,'viking ships at sunrise':15,
    'hour of the olympics':16,'tonight on the titanic':17,'buffalo before breakfast':18,
    'tigers at twilight':19,'dingoes at dinnertime':20,'civil war on sunday':21,
    'revolutionary war on wednesday':22,'twister on tuesday':23,'earthquake in the early morning':24,
    'stage fright on a summer night':25,'good morning gorillas':26,'good morning, gorillas':26,
    'thanksgiving on thursday':27,'high tide in hawaii':28
  }},
  // Magic Tree House Merlin Missions (#29-55)
  {s:'Magic Tree House Merlin Missions',titles:{
    'christmas in camelot':29,'haunted castle on hallows eve':30,'haunted castle on hallow\'s eve':30,
    'summer of the sea serpent':31,'winter of the ice wizard':32,'carnival at candlelight':33,
    'season of the sandstorms':34,'night of the new magicians':35,'blizzard of the blue moon':36,
    'dragon of the red dawn':37,'monday with a mad genius':38,'dark day in the deep sea':39,
    'eve of the emperor penguin':40,'mountain of ghosts':41,'a good night for ghosts':42,
    'leprechaun in late winter':43,'a ghost tale for christmas time':44,'a crazy day with cobras':45,
    'dogs in the dead of night':46,'abe lincoln at last':47,'a perfect time for pandas':48,
    'stallion by starlight':49,'hurry up houdini':50,'high time for heroes':51,
    'soccer on sunday':52,'shadow of the shark':53,'balto of the blue dawn':54,
    'night of the ninth dragon':55
  }},
  // Junie B. Jones
  {s:'Junie B. Jones',titles:{
    'junie b jones and the stupid smelly bus':1,'junie b jones and a little monkey business':2,
    'junie b jones and her big fat mouth':3,'junie b jones and some sneaky peeky spying':4,
    'junie b jones and the yucky blucky fruitcake':5,'junie b jones and that meanie jim\'s birthday':6,
    'junie b jones loves handsome warren':7,'junie b jones has a monster under her bed':8,
    'junie b jones is not a crook':9,'junie b jones is a party animal':10,
    'junie b jones is a beauty shop guy':11,'junie b jones smells something fishy':12,
    'junie b jones is (almost) a flower girl':13,'junie b jones and the mushy gushy valentine':14,
    'junie b jones has a peep in her pocket':15,'junie b jones is captain field day':16,
    'junie b jones is a graduation girl':17,'junie b jones first grader (at last!)':18,
    'junie b jones boss of lunch':19,'junie b jones toothless wonder':20,
    'junie b jones cheater pants':21,'junie b jones one-man band':22,
    'junie b jones shipwrecked':23,'junie b jones aloha-ha-ha':24,
    'junie b jones dumb bunny':25,'junie b jones turkeys we have loved and eaten':26,
    'junie b jones jingle bells batman smells':27,'junie b jones mr. scary':28
  }},
  // Diary of a Wimpy Kid
  {s:'Diary of a Wimpy Kid',titles:{
    'diary of a wimpy kid':1,'rodrick rules':2,'the last straw':3,'dog days':4,
    'the ugly truth':5,'cabin fever':6,'the third wheel':7,'hard luck':8,
    'the long haul':9,'old school':10,'double down':11,'the getaway':12,
    'the meltdown':13,'wrecking ball':14,'the deep end':15,'big shot':16,
    'diper överlöde':17,'no brainer':18,'hot mess':19
  }},
  // Captain Underpants
  {s:'Captain Underpants',titles:{
    'the adventures of captain underpants':1,'captain underpants and the attack of the talking toilets':2,
    'captain underpants and the invasion of the incredibly naughty cafeteria ladies from outer space':3,
    'captain underpants and the perilous plot of professor poopypants':4,
    'captain underpants and the wrath of the wicked wedgie woman':5,
    'captain underpants and the big bad battle of the bionic booger boy part 1':6,
    'captain underpants and the big bad battle of the bionic booger boy part 2':7,
    'captain underpants and the preposterous plight of the purple potty people':8,
    'captain underpants and the terrifying return of tippy tinkletrousers':9,
    'captain underpants and the revolting revenge of the radioactive robo-boxers':10,
    'captain underpants and the tyrannical retaliation of the turbo toilet 2000':11,
    'captain underpants and the sensational saga of sir stinks-a-lot':12
  }},
  // Harry Potter
  {s:'Harry Potter',titles:{
    'harry potter and the sorcerer\'s stone':1,'harry potter and the philosopher\'s stone':1,
    'harry potter and the chamber of secrets':2,'harry potter and the prisoner of azkaban':3,
    'harry potter and the goblet of fire':4,'harry potter and the order of the phoenix':5,
    'harry potter and the half-blood prince':6,'harry potter and the deathly hallows':7
  }},
  // The Boxcar Children
  {s:'The Boxcar Children',titles:{
    'the boxcar children':1,'surprise island':2,'the yellow house mystery':3,
    'mystery ranch':4,'mike\'s mystery':5,'blue bay mystery':6,
    'the woodshed mystery':7,'the lighthouse mystery':8,'mountain top mystery':9,
    'schoolhouse mystery':10,'caboose mystery':11,'houseboat mystery':12,
    'snowbound mystery':13,'tree house mystery':14,'bicycle mystery':15
  }},
  // A to Z Mysteries
  {s:'A to Z Mysteries',titles:{
    'the absent author':1,'the bald bandit':2,'the canary caper':3,'the deadly dungeon':4,
    'the empty envelope':5,'the falcon\'s feathers':6,'the goose\'s gold':7,
    'the haunted hotel':8,'the invisible island':9,'the jaguar\'s jewel':10,
    'the kidnapped king':11,'the lucky lottery':12,'the missing mummy':13,
    'the ninth nugget':14,'the orange outlaw':15,'the panda puzzle':16,
    'the quicksand question':17,'the runaway racehorse':18,'the school skeleton':19,
    'the talking t-rex':20,'the vampire\'s vacation':21,'the white wolf':22,
    'the x\'ed-out x-ray':23,'the yellow yacht':24,'the zombie zone':25,'the absent author':1
  }},
  // Goosebumps
  {s:'Goosebumps',titles:{
    'welcome to dead house':1,'stay out of the basement':2,'monster blood':3,
    'say cheese and die!':4,'say cheese and die':4,'the curse of the mummy\'s tomb':5,
    'let\'s get invisible!':6,'let\'s get invisible':6,'night of the living dummy':7,
    'the girl who cried monster':8,'welcome to camp nightmare':9,'the ghost next door':10,
    'the haunted mask':11,'be careful what you wish for':12,'piano lessons can be murder':13,
    'the werewolf of fever swamp':14,'you can\'t scare me!':15,'you can\'t scare me':15,
    'one day at horrorland':16,'why i\'m afraid of bees':17,'monster blood ii':18,
    'deep trouble':19,'the scarecrow walks at midnight':20,'go eat worms':21,
    'ghost beach':22,'phantom of the auditorium':23,'attack of the mutant':24,
    'my hairiest adventure':25,'a night in terror tower':26,'the cuckoo clock of doom':27,
    'monster blood iii':28,'it came from beneath the sink':29,'night of the living dummy ii':30,
    'the barking ghost':31,'the horror at camp jellyjam':32,'revenge of the lawn gnomes':33,
    'a shocker on shock street':34,'the haunted mask ii':35,'the headless ghost':36,
    'the abominable snowman of pasadena':37,'how i got my shrunken head':38,
    'night of the living dummy iii':39,'the blob that ate everyone':40
  }},
  // Percy Jackson and the Olympians
  {s:'Percy Jackson and the Olympians',titles:{
    'the lightning thief':1,'the sea of monsters':2,'the titan\'s curse':3,
    'the battle of the labyrinth':4,'the last olympian':5
  }},
  // The Chronicles of Narnia
  {s:'The Chronicles of Narnia',titles:{
    'the magician\'s nephew':1,'the lion the witch and the wardrobe':2,
    'the horse and his boy':3,'prince caspian':4,'the voyage of the dawn treader':5,
    'the silver chair':6,'the last battle':7
  }},
  // Warriors (Erin Hunter)
  {s:'Warriors',titles:{
    'into the wild':1,'fire and ice':2,'forest of secrets':3,
    'rising storm':4,'a dangerous path':5,'the darkest hour':6
  }},
  // Mercy Watson
  {s:'Mercy Watson',titles:{
    'mercy watson to the rescue':1,'mercy watson goes for a ride':2,
    'mercy watson fights crime':3,'mercy watson princess in disguise':4,
    'mercy watson something wonky this way comes':5,'mercy watson thinks like a pig':6
  }},
  // Dog Man
  {s:'Dog Man',titles:{
    'dog man':1,'dog man unleashed':2,'dog man a tale of two kitties':3,
    'dog man and cat kid':4,'dog man lord of the fleas':5,'dog man brawl of the wild':6,
    'dog man for whom the ball rolls':7,'dog man fetch-22':8,
    'dog man grime and punishment':9,'dog man mothering heights':10,
    'dog man twenty thousand fleas under the sea':11,'dog man the scarlet shedder':12
  }},
  // Big Nate
  {s:'Big Nate',titles:{
    'big nate in a class by himself':1,'big nate strikes again':2,'big nate on a roll':3,
    'big nate goes for broke':4,'big nate flips out':5,'big nate in the zone':6,
    'big nate lives it up':7,'big nate blasts off':8,'big nate goes bananas':9,
    'big nate stay classy':10,'big nate hug it out':11,'big nate the crowd goes wild':12
  }},
  // Sweet Valley Twins
  {s:'Sweet Valley Twins',titles:{
    'best friends':1,'teacher\'s pet':2,'the haunted house':3,'choosing sides':4,
    'sneaking out':5,'the new girl':6,'three\'s a crowd':7,'first place':8,
    'against the rules':9,'one of the gang':10,'buried treasure':11,'keeping secrets':12,
    'stretching the truth':13,'tug of war':14,'the older boy':15,'second best':16,
    'boys against girls':17,'center of attention':18,'the bully':19,'playing hooky':20,
    'left behind':21,'out of place':22,'claim to fame':23,'jumping to conclusions':24,
    'standing out':25,'taking charge':26,'teamwork':27,'april fool':28,
    'jessica and the brat attack':29,'princess elizabeth':30,'jessica\'s bad idea':31,
    'jessica on stage':32,'elizabeth\'s new hero':33,'jessica the rock star':34,
    'amy\'s pen pal':35,'mary is missing':36,'the war between the twins':37,
    'lois strikes back':38,'jessica and the money mix-up':39,'danny means trouble':40
  }},
  // Sweet Valley High
  {s:'Sweet Valley High',titles:{
    'double love':1,'secrets':2,'playing with fire':3,'power play':4,
    'all night long':5,'dangerous love':6,'dear sister':7,'heartbreaker':8,
    'racing hearts':9,'wrong kind of girl':10,'too good to be true':11,
    'when love dies':12,'kidnapped':13,'deceptions':14,'promises':15,
    'rags to riches':16,'love letters':17,'head over heels':18,'showdown':19,
    'crash landing':20,'runaway':21,'too much in love':22,'say goodbye':23,
    'memories':24,'nowhere to run':25,'hostage':26,'lovestruck':27,
    'alone in the crowd':28,'bitter rivals':29,'jealous lies':30
  }},
  // The Baby-Sitters Club
  {s:'The Baby-Sitters Club',titles:{
    'kristy\'s great idea':1,'claudia and the phantom phone calls':2,
    'the truth about stacey':3,'mary anne saves the day':4,'dawn and the impossible three':5,
    'kristy\'s big day':6,'claudia and mean janine':7,'boy-crazy stacey':8,
    'the ghost at dawn\'s house':9,'logan likes mary anne':10,
    'kristy and the snobs':11,'claudia and the new girl':12,
    'good-bye stacey good-bye':13,'hello mallory':14,
    'little miss stoneybrook and dawn':15,'jessi\'s secret language':16,
    'mary anne\'s bad luck mystery':17,'stacey\'s mistake':18,
    'claudia and the bad joke':19,'kristy and the walking disaster':20,
    'mallory and the trouble with twins':21,'jessi ramsey pet-sitter':22,
    'dawn on the coast':23,'kristy and the mother\'s day surprise':24,
    'mary anne and the search for tigger':25,'claudia and the sad good-bye':26,
    'jessi and the superbrat':27,'welcome back stacey':28,
    'mallory and the mystery diary':29,'mary anne and the great romance':30
  }},
  // The Saddle Club
  {s:'The Saddle Club',titles:{
    'horse crazy':1,'horse shy':2,'horse sense':3,'horse power':4,
    'trail mates':5,'dude ranch':6,'horse play':7,'horse show':8,
    'hoof beat':9,'riding camp':10,'horse wise':11,'rodeo rider':12,
    'starlight christmas':13,'sea horse':14,'team play':15,'horse games':16,
    'horsenapped':17,'pack trip':18,'star rider':19,'snow ride':20,
    'racehorse':21,'fox hunt':22,'horse trouble':23,'ghost rider':24,
    'show jumper':25,'beach ride':26,'bridle path':27,'stable manners':28,
    'ranch hands':29,'autumn trail':30,'hayride':31,'hurdle':32,
    'gymkhana':33,'country rider':34,'stable witch':35,'western star':36,
    'horse contest':37,'dust rider':38,'gift horse':39,'midnight ride':40
  }},
  // Extreme Adventures (Justin D'Ath)
  {s:'Extreme Adventures',titles:{
    'croc bait':1,'shark bait':2,'bushfire':3,'cave in':4,
    'killer bees':5,'wet world':6,'contact':7,'anaconda':8
  }},
  // Judy Blume (Fudge series)
  {s:'Fudge',titles:{
    'tales of a fourth grade nothing':1,'otherwise known as sheila the great':2,
    'superfudge':3,'fudge-a-mania':4,'double fudge':5
  }},
  // Henry Winkler / Lin Oliver — Hank Zipzer
  {s:'Hank Zipzer',titles:{
    'niagara falls or does it':1,'i got a d in salami':2,'day of the iguana':3,
    'the zippity zinger':4,'the night i flunked my field trip':5,
    'holy enchilada':6,'help i m trapped in my lunch box':7,
    'my secret life as a ping-pong wizard':8,'my dog\'s a scaredy-cat':9,
    'the hundred-year-old secret':10,'a tale of two tails':11,
    'who ordered this baby definitely not me':12,
    'the life of me enter at your own risk':13,
    'worst professional soccer team ever':14,'early bird special':15,
    'the curtain went up my pants fell down':16
  }},
  // Henry Winkler / Lin Oliver — Here's Hank
  {s:'Here\'s Hank',titles:{
    'weirdo halloween':1,'a brand-new me':2,'homework i love you now what':3,
    'the christmas secret':4,'everybody is somebody':4,
    'a big fat disaster':5,'the best school year ever':5,
    'stop that nose':6,'weirdo':7,'a perfect score':8
  }},
  // Wayside School (Louis Sachar)
  {s:'Wayside School',titles:{
    'sideways stories from wayside school':1,'wayside school is falling down':2,
    'wayside school gets a little stranger':3,'wayside school beneath the cloud of doom':4
  }},
  // Ramona (Beverly Cleary)
  {s:'Ramona',titles:{
    'beezus and ramona':1,'ramona the pest':2,'ramona the brave':3,
    'ramona and her father':4,'ramona and her mother':5,'ramona quimby age 8':6,
    'ramona forever':7,'ramona\'s world':8
  }},
  // Henry Huggins (Beverly Cleary)
  {s:'Henry Huggins',titles:{
    'henry huggins':1,'henry and beezus':2,'henry and ribsy':3,
    'henry and the clubhouse':4,'henry and the paper route':5,'ribsy':6
  }},
  // Little House (Laura Ingalls Wilder)
  {s:'Little House',titles:{
    'little house in the big woods':1,'farmer boy':2,'little house on the prairie':3,
    'on the banks of plum creek':4,'by the shores of silver lake':5,
    'the long winter':6,'little town on the prairie':7,
    'these happy golden years':8,'the first four years':9
  }},
  // American Girl (main series — some key titles)
  {s:'American Girl: Samantha',titles:{
    'meet samantha':1,'samantha learns a lesson':2,'samantha\'s surprise':3,
    'happy birthday samantha':4,'samantha saves the day':5,'changes for samantha':6
  }},
  {s:'American Girl: Kit',titles:{
    'meet kit':1,'kit learns a lesson':2,'kit\'s surprise':3,
    'happy birthday kit':4,'kit saves the day':5,'changes for kit':6
  }},
  {s:'American Girl: Molly',titles:{
    'meet molly':1,'molly learns a lesson':2,'molly\'s surprise':3,
    'happy birthday molly':4,'molly saves the day':5,'changes for molly':6
  }},
  // Dear Dumb Diary (Jim Benton)
  {s:'Dear Dumb Diary',titles:{
    'let\'s pretend this never happened':1,'my pants are haunted':2,
    'Am I the Princess or the Frog?':3,'never do anything ever':4,
    'can adults become human?':5,'the problem with here is that it used to be there':6,
    'never underestimate your dumbness':7,'it\'s not my fault i know everything':8,
    'that\'s what friends are not for':9,'the worst things in life are also free':10,
    'okay so maybe i do have superpowers':11,'me i just stumbled across your diary':12
  }},
  // Animorphs (K.A. Applegate)
  {s:'Animorphs',titles:{
    'the invasion':1,'the visitor':2,'the encounter':3,'the message':4,
    'the predator':5,'the capture':6,'the stranger':7,'the alien':8,
    'the secret':9,'the android':10,'the forgotten':11,'the reaction':12,
    'the change':13,'the unknown':14,'the escape':15,'the warning':16,
    'the underground':17,'the decision':18,'the departure':19,'the discovery':20,
    'the threat':21,'the solution':22,'the pretender':23,'the suspicion':24,
    'the extreme':25,'the attack':26,'the exposed':27,'the experiment':28,
    'the sickness':29,'the reunion':30,'the conspiracy':31,'the separation':32,
    'the illusion':33,'the prophecy':34,'the proposal':35,'the mutation':36,
    'the weakness':37,'the arrival':38,'the hidden':39,'the other':40,
    'the familiar':41,'the journey':42,'the test':43,'the unexpected':44,
    'the revelation':45,'the deception':46,'the resistance':47,'the return':48,
    'the diversion':49,'the ultimate':50,'the absolute':51,'the sacrifice':52,
    'the answer':53,'the beginning':54
  }},
  // The Hunger Games
  {s:'The Hunger Games',titles:{
    'the hunger games':1,'catching fire':2,'mockingjay':3,'the ballad of songbirds and snakes':0
  }},
  // Divergent
  {s:'Divergent',titles:{
    'divergent':1,'insurgent':2,'allegiant':3,'four':0
  }},
  // Maze Runner
  {s:'The Maze Runner',titles:{
    'the maze runner':1,'the scorch trials':2,'the death cure':3,
    'the kill order':0,'the fever code':0
  }},
  // Ender's Game (Orson Scott Card)
  {s:'Ender\'s Game',titles:{
    'ender\'s game':1,'speaker for the dead':2,'xenocide':3,'children of the mind':4,
    'ender\'s shadow':5,'shadow of the hegemon':6,'shadow puppets':7,
    'shadow of the giant':8,'shadows alive':9
  }},
  // Redwall (Brian Jacques)
  {s:'Redwall',titles:{
    'redwall':1,'mossflower':2,'mattimeo':3,'mariel of redwall':4,'salamandastron':5,
    'martin the warrior':6,'the bellmaker':7,'outcast of redwall':8,
    'pearls of lutra':9,'the long patrol':10,'marlfox':11,'the legend of luke':12,
    'lord brocktree':13,'taggerung':14,'triss':15,'loamhedge':16,
    'rakkety tam':17,'high rhulain':18,'eulalia':19,'doomwyte':20,
    'the rogue crew':21
  }},
  // Deltora Quest
  {s:'Deltora Quest',titles:{
    'the forests of silence':1,'the lake of tears':2,'city of the rats':3,
    'the shifting sands':4,'dread mountain':5,'the maze of the beast':6,
    'the valley of the lost':7,'return to del':8
  }},
  // Horrible Histories (Terry Deary — selected)
  {s:'Horrible Histories',titles:{
    'the terrible tudors':1,'the awesome egyptians':2,'the groovy greeks':3,
    'the rotten romans':4,'the vicious vikings':5,'the blitzed brits':6,
    'the wicked words':7,'the angry aztecs':8,'the measly middle ages':9,
    'the frightful first world war':10,'the woeful second world war':11,
    'the savage stone age':12,'the cut-throat celts':13
  }},
  // I Survived (Lauren Tarshis)
  {s:'I Survived',titles:{
    'i survived the sinking of the titanic 1912':1,
    'i survived the shark attacks of 1916':2,
    'i survived hurricane katrina 2005':3,
    'i survived the bombing of pearl harbor 1941':4,
    'i survived the san francisco earthquake 1906':5,
    'i survived the attacks of september 11 2001':6,
    'i survived the battle of gettysburg 1863':7,
    'i survived the japanese tsunami 2011':8,
    'i survived the nazi invasion 1944':9,
    'i survived the destruction of pompeii ad 79':10,
    'i survived the great chicago fire 1871':11,
    'i survived the joplin tornado 2011':12,
    'i survived the california wildfires 2018':13,
    'i survived the eruption of mount st helens 1980':14,
    'i survived the Wellington avalanche 1910':15,
    'i survived the children\'s blizzard 1888':16,
    'i survived the clone conspiracy':17,
    'i survived the hindenburg disaster 1937':18,
    'i survived the american revolution 1776':19,
    'i survived the attack of the grizzlies 1967':20
  }},
  // Geronimo Stilton
  {s:'Geronimo Stilton',titles:{
    'lost treasure of the emerald eye':1,'the curse of the cheese pyramid':2,
    'cat and mouse in a haunted house':3,'i\'m too fond of my fur':4,
    'four mice deep in the jungle':5,'paws off cheddarface':6,
    'red pizzas for a blue count':7,'attack of the bandit cats':8,
    'a fabumouse vacation for geronimo':9,'all because of a cup of coffee':10,
    'it\'s halloween you \'fraidy mouse':11,'merry christmas geronimo':12,
    'the phantom of the subway':13,'the temple of the ruby of fire':14,
    'the mona mousa code':15,'a cheese-colored camper':16,
    'watch your whiskers stilton':17,'shipwreck on the pirate islands':18,
    'my name is stilton geronimo stilton':19,'surf\'s up geronimo':20
  }},
  // Treehouse (Andy Griffiths)
  {s:'Treehouse',titles:{
    'the 13-story treehouse':1,'the 26-story treehouse':2,'the 39-story treehouse':3,
    'the 52-story treehouse':4,'the 65-story treehouse':5,'the 78-story treehouse':6,
    'the 91-story treehouse':7,'the 104-story treehouse':8,'the 117-story treehouse':9,
    'the 130-story treehouse':10,'the 143-story treehouse':11,'the 156-story treehouse':12,
    'the 169-story treehouse':13,'the 182-story treehouse':14,'the 195-story treehouse':15
  }},
  // Skulduggery Pleasant (Derek Landy)
  {s:'Skulduggery Pleasant',titles:{
    'skulduggery pleasant':1,'playing with fire':2,'the faceless ones':3,
    'dark days':4,'mortal coil':5,'death bringer':6,'kingdom of the wicked':7,
    'last stand of dead men':8,'the dying of the light':9,'resurrection':10,
    'midnight':11,'bedlam':12,'seasons of war':13,'dead or alive':14,
    'until the end':15,'the forever court':16
  }},
  // Wings of Fire (Tui T. Sutherland)
  {s:'Wings of Fire',titles:{
    'the dragonet prophecy':1,'the lost heir':2,'the hidden kingdom':3,
    'the dark secret':4,'the brightest night':5,'moon rising':6,
    'winter turning':7,'escaping peril':8,'talons of power':9,
    'darkness of dragons':10,'the lost continent':11,'the hive queen':12,
    'the poison jungle':13,'the dangerous gift':14,'the flames of hope':15,
    'a world of dragons':16
  }},
  // The Ranger's Apprentice (John Flanagan)
  {s:"Ranger's Apprentice",titles:{
    'the ruins of gorlan':1,'the burning bridge':2,'the icebound land':3,
    'battle for skandia':4,'the sorcerer of the north':5,'the siege of macindaw':6,
    'erak\'s ransom':7,'the kings of clonmel':8,'halt\'s peril':9,
    'the emperor of nihon-ja':10,'the lost stories':11,'the royal ranger':12
  }},
  // Brotherband Chronicles (John Flanagan)
  {s:'Brotherband Chronicles',titles:{
    'the outcasts':1,'the invaders':2,'the hunters':3,'slaves of socorro':4,
    'scorpion mountain':5,'the ghostfaces':6,'the caldera':7,'return of the temujai':8
  }},
  // Fablehaven (Brandon Mull)
  {s:'Fablehaven',titles:{
    'fablehaven':1,'rise of the evening star':2,'grip of the shadow plague':3,
    'secrets of the dragon sanctuary':4,'keys to the demon prison':5
  }},
  // Alcatraz vs. the Evil Librarians (Brandon Sanderson)
  {s:'Alcatraz',titles:{
    'alcatraz versus the evil librarians':1,'the scrivener\'s bones':2,
    'the knights of crystallia':3,'the shattered lens':4,'the dark talent':5
  }},
  // Seven Wonders (Peter Lerangis)
  {s:'Seven Wonders',titles:{
    'the colossus rises':1,'lost in babylon':2,'the tomb of shadows':3,
    'the curse of the king':4,'the legend of the rift':5,'the end of forever':6
  }},
  // 39 Clues
  {s:'The 39 Clues',titles:{
    'the maze of bones':1,'one false note':2,'the sword thief':3,
    'beyond the grave':4,'the black circle':5,'in too deep':6,
    'the vipers nest':7,'the emperor\'s code':8,'storm warning':9,
    'into the gauntlet':10,'vespers rising':11,'the medusa plot':12,
    'a king\'s ransom':13,'the dead of night':14,'shatterproof':15,
    'mission atomic':16
  }},
  // Sherlock Holmes (Conan Doyle — key titles)
  {s:'Sherlock Holmes',titles:{
    'a study in scarlet':1,'the sign of the four':2,'the hound of the baskervilles':3,
    'the valley of fear':4,'the adventures of sherlock holmes':5,
    'the memoirs of sherlock holmes':6,'the return of sherlock holmes':7,
    'his last bow':8,'the case-book of sherlock holmes':9
  }},
  // Discworld (Terry Pratchett — selected)
  {s:'Discworld',titles:{
    'the colour of magic':1,'the light fantastic':2,'equal rites':3,'mort':4,
    'sourcery':5,'wyrd sisters':6,'pyramids':7,'guards guards':8,
    'eric':9,'moving pictures':10,'reaper man':11,'witches abroad':12,
    'small gods':13,'lords and ladies':14,'men at arms':15,'soul music':16,
    'interesting times':17,'maskerade':18,'feet of clay':19,'hogfather':20,
    'jingo':21,'the last continent':22,'carpe jugulum':23,'the fifth elephant':24,
    'the truth':25,'thief of time':26,'the last hero':27,'the amazing maurice and his educated rodents':28,
    'night watch':29,'the wee free men':30,'monstrous regiment':31,
    'a hat full of sky':32,'going postal':33,'thud':34,'wintersmith':35,
    'making money':36,'i shall wear midnight':37,'unseen academicals':38,
    'snuff':39,'raising steam':40,'the shepherd\'s crown':41
  }},
  // Wimpy Kid related — Diary of an Awesome Friendly Kid
  {s:'Diary of an Awesome Friendly Kid',titles:{
    'diary of an awesome friendly kid':1,'rodrick rules according to rowley':2,
    'rowley jefferson\'s awesome friendly adventure':3,'rowley jefferson\'s awesome friendly spooky stories':4
  }}
];

// Looks up a cleaned title directly in KNOWN_SERIES and, on a hit, fills the
// Series Name / Series # fields (only if they're currently empty).
function matchKnownSeries(title){
  if(!title)return false;
  var t=title.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  for(var i=0;i<KNOWN_SERIES.length;i++){
    var entry=KNOWN_SERIES[i];
    var num=entry.titles[t];
    if(num!==undefined){
      if(!document.getElementById('f-series').value)
        document.getElementById('f-series').value=entry.s;
      if(!document.getElementById('f-series-num').value)
        document.getElementById('f-series-num').value=num;
      return true;
    }
  }
  return false;
}

// Fallback for series not in KNOWN_SERIES: pattern-matches common
// "Series Name #N" / "Book N of Series Name" phrasings out of API text
// (e.g. a subtitle or description) when matchKnownSeries() comes up empty.
function extractSeriesFromText(text){
  if(!text||document.getElementById('f-series').value)return false;
  // Patterns ordered most-specific to least:
  // "Magic Tree House #17: Tonight..." or "Series Name #N"
  var patterns=[
    // "Series Name #N" or "Series Name, No. N" at start or after colon
    [/^(.+?)(?:\s+(?:No\.?|#|Book|Vol\.?)\s*(\d+(?:\.\d+)?))[:\s]/i, 1, 2],
    // "Series Name #N" anywhere
    [/(.+?)\s+(?:No\.?|#)\s*(\d+(?:\.\d+)?)/i, 1, 2],
    // "Book N of [the] Series Name"
    [/[Bb]ook\s+(\d+(?:\.\d+)?)\s+(?:of|in)\s+(?:the\s+)?(.{4,50}?)(?:\s+series)?[\.,\s]|$/i, 2, 1],
    // "Series Name, Book N" or "Series Name, Volume N"
    [/(.{4,50}?),\s+(?:[Bb]ook|[Vv]ol(?:ume)?)\.?\s+(\d+(?:\.\d+)?)/i, 1, 2],
    // "(Series Name #N)" in parentheses
    [/\(([^)]{4,50}?)\s+(?:No\.?|#|Book|Vol\.?)\s*(\d+(?:\.\d+)?)\)/i, 1, 2],
    // "Series Name; #N"
    [/(.+?);\s*(?:No\.?|#|Book)\s*(\d+(?:\.\d+)?)/i, 1, 2],
  ];
  for(var i=0;i<patterns.length;i++){
    var m=text.match(patterns[i][0]);
    if(m){
      var nameIdx=patterns[i][1], numIdx=patterns[i][2];
      var sName=(m[nameIdx]||'').replace(/^(?:the|a)\s+/i,'').replace(/\s+series$/i,'').replace(/[,\s(]+$/,'').trim();
      var sNum=(m[numIdx]||'').trim();
      if(sName&&sName.length>2){
        document.getElementById('f-series').value=sName;
        if(sNum&&!document.getElementById('f-series-num').value)
          document.getElementById('f-series-num').value=sNum;
        return true;
      }
    }
  }
  return false;
}
