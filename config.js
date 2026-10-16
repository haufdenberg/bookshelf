// ============================================================================
// config.js — constants and top-level UI state
//
// Nothing in here does anything by itself — it's just the shared data that
// the rest of the app reads from and writes to. Keeping it in one place
// makes "what counts as a genre" or "what's the current view" a single
// source of truth instead of scattered magic values.
//
// Depends on: nothing.
// Used by:    almost everything (bookCard, forms, filters, main.js, ...).
// ============================================================================

// ── Transient UI state (not persisted — resets on page load) ────────────────
var currentView = 'dashboard';
var displayMode = 'grid';
var editingId = null;
var viewingId = null;
var formRating = 0;
var activeTab = 'info';

// ── Cosmetic randomization pools ─────────────────────────────────────────────
// Book cover "spine" color and fallback emoji are derived deterministically
// from the title (see getEmoji/bookCard), just picked from these pools.
var SPINE_COLORS = ['#A84332','#4A6741','#B8882A','#2C5282','#6B46C1','#2D3748','#744210','#276749'];
var EMOJIS = ['📖','📚','📕','📗','📘','📙','🔖','✍️','🌟','💡'];

// ── Genre → subgenre map ──────────────────────────────────────────────────────
// Drives both the Add/Edit Book form's Genre/Subgenre dropdowns and the
// Library view's genre/subgenre filters (see genre-fields.js).
var SUBGENRES = {
  // ── Story genres (cross-age — subgenres work for children's, YA, and adult alike) ──
  'Realistic Fiction':['Contemporary','Coming-of-Age','School Life','Family & Home','Friendship','Sports','Social Issues','Humour','Verse Novel','Slice of Life','Domestic','Epistolary'],
  'Fantasy':['Epic/High Fantasy','Urban Fantasy','Dark Fantasy','Fairy Tale Retelling','Cozy Fantasy','Mythic Fantasy','Portal Fantasy','Sword & Sorcery','Romantic Fantasy','Grimdark','Magical Realism'],
  'Science Fiction':['Hard Sci-Fi','Space Opera','Cyberpunk','Dystopian','Post-Apocalyptic','Military Sci-Fi','Time Travel','Biopunk','Solarpunk','First Contact','Cli-Fi'],
  'Mystery':['Cozy Mystery','Police Procedural','Hard-Boiled','Amateur Sleuth','Whodunit','Locked-Room','Historical Mystery','Noir Mystery','Psychological'],
  'Thriller':['Psychological Thriller','Legal Thriller','Medical Thriller','Political Thriller','Espionage','Techno-Thriller','Domestic Thriller','Financial Thriller','Environmental Thriller'],
  'Horror':['Supernatural','Psychological Horror','Gothic','Cosmic Horror','Paranormal','Creature Feature','Haunted House','Body Horror','Slasher'],
  'Historical Fiction':['Ancient World','Medieval','Renaissance','Victorian','Regency','WWI','WWII','American Civil War','Colonial','Cold War'],
  'Romance':['Contemporary Romance','Historical Romance','Paranormal Romance','Romantic Suspense','Clean Romance','Inspirational Romance','Sports Romance','Small-Town Romance'],
  'Adventure':['Survival','Quest','Sea Adventure','Wilderness','Action-Adventure','Expedition','Military Adventure','Heist'],
  'Literary Fiction':['Stream of Consciousness','Postmodern','Southern Gothic','Minimalist','Metafiction','Satire','Social Commentary','Experimental'],
  'Mythology & Folklore':['Greek & Roman','Norse','Egyptian','Fairy Tales','Fables','Legends & Epics','World Mythology','Retellings'],
  'Horror & Ghost Stories':['Supernatural','Psychological Horror','Gothic','Haunted House','Creature Feature','Paranormal','Cosmic Horror'],
  'Humour':['Satire','Parody','Absurdist','Slapstick','Dark Comedy','Dry Wit'],
  'Crime':['Heist','Noir','Legal Crime','Organized Crime','Gang Fiction','Forensic'],
  // ── Picture books ──
  'Picture Book':['Alphabet & Numbers','Animals & Nature','Bedtime & Lullaby','Concept Book','Fairy Tale & Fable','Family & Home','Feelings & Emotions','Friendship','Humour','Imagination & Play','Rhyming','Social Skills','Seasonal & Holidays','Wordless'],
  // ── Non-fiction (works for all ages) ──
  'Non-Fiction':['Animals & Nature','Art & Music','Biography & Memoir','Crafts & Activities','History','How Things Work','Math & Logic','Science & Technology','Social Studies','Sports','True Crime','Travel','Food & Drink','Health & Wellness','Business & Economics','Politics','Self-Help','Philosophy','Religion & Spirituality'],
  'Biography':['Autobiography','Memoir','Political Biography','Literary Biography','Celebrity','Sports Biography','Scientist/Inventor','Activist','Historical Figure'],
  'Science':['Astronomy & Space','Biology & Evolution','Physics','Chemistry','Environment & Ecology','Mathematics','Neuroscience','Medicine'],
  'History':['World History','Social History','Ancient History','Medieval History','Modern History','Military History','Cultural History','Economic History'],
  'Philosophy':['Ethics','Logic','Metaphysics','Political Philosophy','Existentialism','Eastern Philosophy','Philosophy of Mind','Epistemology'],
  // ── Other formats ──
  'Graphic Novel / Comics':['Superhero','Slice of Life','Memoir & Biography','Fantasy','Science Fiction','Horror','Literary','Manga','Humour'],
  'Poetry':['Lyric Poetry','Narrative Poetry','Epic Poetry','Free Verse','Spoken Word','Haiku','Sonnets','Verse Novel'],
  'Spirituality & Religion':['Christianity','Islam','Buddhism','Hinduism','Judaism','New Age','Meditation & Mindfulness','Theology'],
  'Sports & Outdoors':['Baseball','Basketball','Football','Soccer','Hiking & Climbing','Cycling','Swimming','Combat Sports','Olympics']
};
