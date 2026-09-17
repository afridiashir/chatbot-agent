/**
 * The emoji picker's catalogue, in WhatsApp's categories. Hand-picked rather
 * than the full Unicode set: the widget ships as one script on other people's
 * pages, so every kilobyte counts. Each line is the emoji followed by the words
 * search matches on.
 */
export type EmojiCategoryId =
  | "smileys"
  | "animals"
  | "food"
  | "activity"
  | "travel"
  | "objects"
  | "symbols"
  | "flags";

export interface EmojiEntry {
  char: string;
  keywords: string;
}

export interface EmojiCategory {
  id: EmojiCategoryId;
  label: string;
  emoji: EmojiEntry[];
}

const parse = (lines: string): EmojiEntry[] =>
  lines
    .trim()
    .split("\n")
    .map((line) => {
      const space = line.indexOf(" ");
      return { char: line.slice(0, space), keywords: line.slice(space + 1).trim() };
    });

const SMILEYS = `
😀 grinning face smile happy
😃 grinning big eyes smile happy
😄 grinning smiling eyes happy laugh
😁 beaming grin teeth
😆 grinning squinting laugh
😅 sweat smile relief
🤣 rolling floor laughing rofl
😂 tears of joy laugh lol
🙂 slightly smiling
🙃 upside down
🫠 melting
😉 wink
😊 smiling blush happy
😇 halo angel innocent
🥰 hearts love adore
😍 heart eyes love
🤩 star struck wow
😘 blowing kiss love
😗 kissing
☺️ smiling relaxed
😚 kissing closed eyes
😙 kissing smiling eyes
🥲 smiling tear
😋 yum delicious tongue
😛 tongue
😜 winking tongue crazy
🤪 zany crazy goofy
😝 squinting tongue
🤑 money mouth rich
🤗 hugging hug
🤭 hand over mouth oops giggle
🫢 hand over mouth surprise
🫣 peeking
🤫 shushing quiet secret
🤔 thinking hmm
🫡 salute
🤐 zipper mouth
🤨 raised eyebrow skeptical
😐 neutral
😑 expressionless
😶 no mouth silent
🫥 dotted line invisible
😏 smirk
😒 unamused
🙄 rolling eyes
😬 grimacing awkward
🤥 lying
😌 relieved
😔 pensive sad
😪 sleepy
🤤 drooling
😴 sleeping zzz
😷 mask sick
🤒 thermometer sick fever
🤕 bandage hurt
🤢 nauseated sick
🤮 vomiting
🤧 sneezing
🥵 hot
🥶 cold freezing
🥴 woozy dizzy
😵 dizzy
🤯 exploding head mind blown
🤠 cowboy
🥳 party celebrate
🥸 disguise
😎 sunglasses cool
🤓 nerd
🧐 monocle
😕 confused
🫤 diagonal mouth meh
😟 worried
🙁 slightly frowning
☹️ frowning sad
😮 open mouth surprised
😯 hushed
😲 astonished shocked
😳 flushed embarrassed
🥺 pleading puppy eyes please
🥹 holding back tears
😦 frowning open mouth
😧 anguished
😨 fearful scared
😰 anxious sweat
😥 sad relieved
😢 crying sad tear
😭 loudly crying sob
😱 screaming fear
😖 confounded
😣 persevering
😞 disappointed
😓 downcast sweat
😩 weary tired
😫 tired
🥱 yawning bored
😤 steam nose triumph
😡 pouting angry mad
😠 angry
🤬 cursing swearing
😈 smiling devil
👿 angry devil
💀 skull dead
☠️ skull crossbones
💩 poop
🤡 clown
👹 ogre
👺 goblin
👻 ghost
👽 alien
🤖 robot
😺 grinning cat
😸 cat smiling eyes
😹 cat tears joy
😻 cat heart eyes
😼 cat smirk
😽 kissing cat
🙀 weary cat
😿 crying cat
😾 pouting cat
🙈 see no evil monkey
🙉 hear no evil monkey
🙊 speak no evil monkey
👋 waving hand hello hi bye
🤚 raised back of hand
🖐️ hand fingers splayed
✋ raised hand stop high five
🖖 vulcan salute
👌 ok hand perfect
🤌 pinched fingers
🤏 pinching small
✌️ victory peace
🤞 crossed fingers luck
🤟 love you gesture
🤘 rock on horns
🤙 call me
👈 pointing left
👉 pointing right
👆 pointing up
👇 pointing down
☝️ index pointing up
🫵 pointing at you
👍 thumbs up like yes ok
👎 thumbs down dislike no
✊ raised fist
👊 fist bump punch
🤛 left fist
🤜 right fist
👏 clapping applause
🙌 raising hands celebrate hooray
🫶 heart hands love
👐 open hands
🤲 palms up together
🤝 handshake deal agreement
🙏 folded hands please thanks pray
✍️ writing hand
💅 nail polish
🤳 selfie
💪 flexed biceps strong
🧠 brain
👀 eyes look
👁️ eye
👅 tongue
👄 mouth
👶 baby
🧒 child
👦 boy
👧 girl
🧑 person
👱 blond person
👨 man
🧔 beard man
👩 woman
🧓 older person
👴 old man
👵 old woman
🙍 person frowning
🙎 person pouting
🙅 person gesturing no
🙆 person gesturing ok
💁 person tipping hand info
🙋 person raising hand question
🙇 person bowing sorry
🤦 facepalm
🤷 shrug dont know
👨‍💻 man technologist developer
👩‍💻 woman technologist developer
🧑‍💼 office worker
👨‍🍳 man cook chef
👩‍⚕️ woman health worker doctor
👮 police officer
👷 construction worker
🥷 ninja
🤴 prince
👸 princess
🎅 santa
🧙 mage wizard
🧚 fairy
🧛 vampire
💃 woman dancing
🕺 man dancing
🚶 person walking
🏃 person running
👫 couple holding hands
💑 couple with heart
👪 family
🗣️ speaking head
👤 bust silhouette
`;

const ANIMALS = `
🐶 dog puppy
🐱 cat kitten
🐭 mouse
🐹 hamster
🐰 rabbit bunny
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🐯 tiger
🦁 lion
🐮 cow
🐷 pig
🐸 frog
🐵 monkey
🐔 chicken
🐧 penguin
🐦 bird
🐤 baby chick
🦆 duck
🦅 eagle
🦉 owl
🦇 bat
🐺 wolf
🐴 horse
🦄 unicorn
🐝 bee honeybee
🐛 bug caterpillar
🦋 butterfly
🐌 snail
🐞 ladybug
🐜 ant
🕷️ spider
🐢 turtle
🐍 snake
🦎 lizard
🦖 t-rex dinosaur
🐙 octopus
🦀 crab
🐠 tropical fish
🐟 fish
🐬 dolphin
🐳 whale
🦈 shark
🐊 crocodile
🐆 leopard
🦓 zebra
🦍 gorilla
🐘 elephant
🦒 giraffe
🐪 camel
🐑 sheep
🐐 goat
🐓 rooster
🦚 peacock
🦜 parrot
🕊️ dove peace
🐿️ chipmunk squirrel
🐾 paw prints
💐 bouquet flowers
🌸 cherry blossom flower
🌹 rose flower
🌺 hibiscus flower
🌻 sunflower
🌼 blossom flower
🌷 tulip flower
🌱 seedling plant
🪴 potted plant
🌲 evergreen tree
🌳 tree
🌴 palm tree
🌵 cactus
🍀 four leaf clover luck
🍁 maple leaf
🍂 fallen leaf autumn
🍃 leaves wind
🍄 mushroom
🌍 globe earth world
🌙 crescent moon night
⭐ star
🌟 glowing star
✨ sparkles
⚡ lightning zap
🔥 fire hot lit
🌈 rainbow
☀️ sun sunny
⛅ sun behind cloud
☁️ cloud
🌧️ rain
⛈️ thunderstorm
❄️ snowflake cold
☃️ snowman
💧 droplet water
🌊 wave ocean
`;

const FOOD = `
🍏 green apple
🍎 red apple
🍐 pear
🍊 orange tangerine
🍋 lemon
🍌 banana
🍉 watermelon
🍇 grapes
🍓 strawberry
🫐 blueberries
🍈 melon
🍒 cherries
🍑 peach
🥭 mango
🍍 pineapple
🥥 coconut
🥝 kiwi
🍅 tomato
🍆 eggplant
🥑 avocado
🥦 broccoli
🥬 leafy green
🥒 cucumber
🌶️ hot pepper chili spicy
🌽 corn
🥕 carrot
🧄 garlic
🧅 onion
🥔 potato
🥐 croissant
🍞 bread
🥖 baguette
🧀 cheese
🥚 egg
🍳 cooking fried egg
🥞 pancakes
🧇 waffle
🍗 poultry leg chicken
🍖 meat bone
🌭 hot dog
🍔 hamburger burger
🍟 fries
🍕 pizza
🥪 sandwich
🌮 taco
🌯 burrito wrap
🥙 flatbread shawarma
🧆 falafel
🥗 salad
🍝 spaghetti pasta
🍜 noodles ramen
🍲 pot of food stew
🍛 curry rice biryani
🍣 sushi
🍱 bento box
🥟 dumpling
🍤 fried shrimp
🍚 cooked rice
🍿 popcorn
🍩 doughnut donut
🍪 cookie
🎂 birthday cake
🍰 shortcake cake
🧁 cupcake
🍫 chocolate
🍬 candy
🍭 lollipop
🍯 honey
🍦 ice cream
🥛 milk
☕ coffee tea hot
🍵 tea chai
🧃 juice box
🥤 cup with straw soda
🧋 bubble tea
🥂 clinking glasses cheers
🧊 ice
🍽️ plate fork knife
🥄 spoon
🧂 salt
`;

const ACTIVITY = `
⚽ soccer football
🏀 basketball
🏈 american football
⚾ baseball
🎾 tennis
🏐 volleyball
🏉 rugby
🎱 pool 8 ball
🏓 ping pong
🏸 badminton
🏏 cricket
🏒 hockey
⛳ golf
🥊 boxing
🥋 martial arts
🎿 ski
⛸️ ice skate
🏋️ weight lifting gym
🤸 cartwheel
🧘 yoga meditation
🏄 surfing
🏊 swimming
🚴 cycling bike
🏆 trophy winner
🥇 gold medal first
🥈 silver medal second
🥉 bronze medal third
🏅 sports medal
🎖️ military medal
🎗️ reminder ribbon
🎫 ticket
🎟️ admission tickets
🎪 circus tent
🎭 performing arts theater
🎨 art palette paint
🎬 clapper board movie
🎤 microphone sing karaoke
🎧 headphones music
🎼 musical score
🎹 piano keyboard
🥁 drum
🎷 saxophone
🎺 trumpet
🎸 guitar
🎻 violin
🎲 dice game
♟️ chess pawn
🎯 bullseye target
🎳 bowling
🎮 video game controller
🧩 puzzle piece
🎉 party popper celebrate tada
🎊 confetti ball
🎈 balloon
🎁 gift present
🎀 ribbon
`;

const TRAVEL = `
🚗 car automobile
🚕 taxi
🚙 suv
🚌 bus
🏎️ racing car
🚓 police car
🚑 ambulance
🚒 fire engine
🚐 minibus van
🛻 pickup truck
🚚 delivery truck
🚛 lorry truck
🚜 tractor
🛵 scooter
🏍️ motorcycle
🚲 bicycle
🛴 kick scooter
🚨 police light siren
🚦 traffic light
🛑 stop sign
⛽ fuel pump gas petrol
🚧 construction
⚓ anchor
⛵ sailboat
🚤 speedboat
🚢 ship
✈️ airplane flight travel
🛫 departure
🛬 arrival
🚁 helicopter
🚀 rocket launch
🛸 flying saucer ufo
🚆 train
🚇 metro subway
🗺️ world map
🧭 compass
🏔️ mountain snow
🏕️ camping
🏖️ beach umbrella
🏜️ desert
🏝️ island
🏟️ stadium
🏛️ classical building
🏠 house home
🏡 house garden
🏢 office building
🏥 hospital
🏦 bank
🏨 hotel
🏪 convenience store shop
🏫 school
🏬 department store mall
🏭 factory
🏰 castle
💒 wedding
🗼 tower
🗽 statue of liberty
🕌 mosque
⛪ church
🛕 hindu temple
🕋 kaaba
⛲ fountain
🌃 night stars
🏙️ cityscape
🌅 sunrise
🌇 sunset
🎡 ferris wheel
🎢 roller coaster
💺 seat
🧳 luggage
`;

const OBJECTS = `
⌚ watch
📱 mobile phone
💻 laptop computer
⌨️ keyboard
🖥️ desktop computer
🖨️ printer
🖱️ computer mouse
💾 floppy disk save
💿 cd disc
📷 camera photo
📸 camera flash
📹 video camera
🎥 movie camera
📞 telephone receiver call
☎️ telephone
📺 television tv
📻 radio
⏰ alarm clock
⏳ hourglass time wait
🔋 battery
🔌 plug
💡 light bulb idea
🔦 flashlight
🕯️ candle
💸 money wings
💵 dollar banknote cash
💰 money bag
💳 credit card payment
💎 gem diamond
⚖️ balance scale
🧰 toolbox
🔧 wrench tool
🔨 hammer
⚙️ gear settings
🧲 magnet
🛡️ shield
🔮 crystal ball
💊 pill medicine
💉 syringe vaccine
🩺 stethoscope doctor
🧬 dna
🔬 microscope
🔭 telescope
🧹 broom
🧺 basket
🧼 soap
🔑 key
🗝️ old key
🚪 door
🛋️ couch sofa
🛏️ bed
🧸 teddy bear
🖼️ framed picture
🛍️ shopping bags
🛒 shopping cart
✉️ envelope email
📧 email
📦 package box delivery parcel
📫 mailbox
📝 memo note
📄 document page
📅 calendar date
📆 tear off calendar
📈 chart increasing growth
📉 chart decreasing
📊 bar chart
📋 clipboard
📌 pushpin
📍 round pushpin location
📎 paperclip attachment
✂️ scissors
🖊️ pen
✏️ pencil
🔍 magnifying glass search
🔒 locked
🔓 unlocked
📚 books
📖 open book
🔖 bookmark
🏷️ label tag price
📰 newspaper
`;

const SYMBOLS = `
❤️ red heart love
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
🤎 brown heart
💔 broken heart
❤️‍🔥 heart on fire
❣️ heart exclamation
💕 two hearts
💞 revolving hearts
💓 beating heart
💗 growing heart
💖 sparkling heart
💘 heart arrow
💝 heart ribbon
☮️ peace
☪️ star crescent
✝️ cross
🕉️ om
☯️ yin yang
✡️ star of david
🛐 place of worship
💯 hundred points perfect
💢 anger
💬 speech balloon chat message
💭 thought balloon
🗯️ anger bubble
💤 zzz sleep
🔔 bell notification
🔕 bell slash mute
📣 megaphone
📢 loudspeaker announcement
✅ check mark button done yes
✔️ check mark
☑️ check box
❌ cross mark no wrong
❎ cross mark button
⭕ hollow circle
⛔ no entry
🚫 prohibited
❗ exclamation
❓ question
‼️ double exclamation
⁉️ exclamation question
⚠️ warning
🚸 children crossing
♻️ recycle
🔰 beginner
🆘 sos help
🆗 ok button
🆕 new button
🆓 free button
🆒 cool button
🆙 up button
🌐 globe web internet
🌀 cyclone
♿ wheelchair
🅿️ parking
🚻 restroom
🚭 no smoking
0️⃣ zero
1️⃣ one
2️⃣ two
3️⃣ three
4️⃣ four
5️⃣ five
6️⃣ six
7️⃣ seven
8️⃣ eight
9️⃣ nine
🔟 ten
#️⃣ hash
▶️ play
⏸️ pause
⏹️ stop
⏩ fast forward
⏪ rewind
🔁 repeat
🔀 shuffle
🔄 arrows refresh
➡️ right arrow
⬅️ left arrow
⬆️ up arrow
⬇️ down arrow
↗️ up right arrow
↘️ down right arrow
↔️ left right arrow
➕ plus
➖ minus
➗ divide
✖️ multiply
♾️ infinity
💲 dollar sign
💱 currency exchange
™️ trade mark
©️ copyright
®️ registered
🔴 red circle
🟠 orange circle
🟡 yellow circle
🟢 green circle
🔵 blue circle
🟣 purple circle
⚫ black circle
⚪ white circle
🟥 red square
🟩 green square
🟦 blue square
⬛ black square
⬜ white square
🔶 orange diamond
🔷 blue diamond
🔺 red triangle up
🔻 red triangle down
`;

const FLAGS = `
🏁 chequered flag finish
🚩 triangular flag
🎌 crossed flags
🏴 black flag
🏳️ white flag
🏳️‍🌈 rainbow flag pride
🇵🇰 pakistan
🇦🇪 united arab emirates uae
🇸🇦 saudi arabia
🇮🇳 india
🇧🇩 bangladesh
🇦🇫 afghanistan
🇨🇳 china
🇹🇷 turkey turkiye
🇶🇦 qatar
🇰🇼 kuwait
🇴🇲 oman
🇧🇭 bahrain
🇮🇷 iran
🇪🇬 egypt
🇬🇧 united kingdom uk britain
🇺🇸 united states usa america
🇨🇦 canada
🇦🇺 australia
🇳🇿 new zealand
🇩🇪 germany
🇫🇷 france
🇮🇹 italy
🇪🇸 spain
🇳🇱 netherlands
🇸🇪 sweden
🇳🇴 norway
🇯🇵 japan
🇰🇷 south korea
🇲🇾 malaysia
🇮🇩 indonesia
🇸🇬 singapore
🇧🇷 brazil
🇲🇽 mexico
🇿🇦 south africa
🇳🇬 nigeria
🇷🇺 russia
`;

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: "smileys", label: "Smileys & people", emoji: parse(SMILEYS) },
  { id: "animals", label: "Animals & nature", emoji: parse(ANIMALS) },
  { id: "food", label: "Food & drink", emoji: parse(FOOD) },
  { id: "activity", label: "Activity", emoji: parse(ACTIVITY) },
  { id: "travel", label: "Travel & places", emoji: parse(TRAVEL) },
  { id: "objects", label: "Objects", emoji: parse(OBJECTS) },
  { id: "symbols", label: "Symbols", emoji: parse(SYMBOLS) },
  { id: "flags", label: "Flags", emoji: parse(FLAGS) },
];

export function searchEmoji(query: string): EmojiEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const results: EmojiEntry[] = [];
  for (const category of EMOJI_CATEGORIES) {
    for (const entry of category.emoji) {
      const keywords = entry.keywords.split(" ");
      if (words.every((word) => keywords.some((keyword) => keyword.startsWith(word)))) {
        results.push(entry);
      }
    }
  }
  return results;
}

const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter() : null;
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Component}|‍|️|\s)+$/u;

/**
 * WhatsApp draws a message of one to three emoji and nothing else large.
 * Plain digits and # count as Emoji_Component, so text must contain a real
 * pictograph too.
 */
export function isJumboEmoji(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !EMOJI_ONLY.test(trimmed) || /[0-9#*]/.test(trimmed.replace(/[0-9#*]️?⃣/g, ""))) {
    return false;
  }
  if (!segmenter) return false;
  let count = 0;
  for (const part of segmenter.segment(trimmed)) {
    if (part.segment.trim() && ++count > 3) return false;
  }
  return count > 0;
}
