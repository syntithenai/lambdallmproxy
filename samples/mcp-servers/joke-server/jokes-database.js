/**
 * Jokes Database
 * 100 jokes across 5 categories (20 each)
 * Categories: programming, dad_jokes, science, animals, food
 */

const jokes = [
  // Programming Jokes (1-20)
  {
    id: 1,
    category: 'programming',
    setup: 'Why do programmers prefer dark mode?',
    punchline: 'Because light attracts bugs!',
    rating: 'G',
    tags: ['programming', 'bugs', 'dark-mode']
  },
  {
    id: 2,
    category: 'programming',
    setup: 'How many programmers does it take to change a light bulb?',
    punchline: 'None, that\'s a hardware problem!',
    rating: 'G',
    tags: ['programming', 'hardware']
  },
  {
    id: 3,
    category: 'programming',
    setup: 'Why do Java developers wear glasses?',
    punchline: 'Because they can\'t C#!',
    rating: 'G',
    tags: ['programming', 'java', 'csharp']
  },
  {
    id: 4,
    category: 'programming',
    setup: 'What\'s a programmer\'s favorite hangout place?',
    punchline: 'The Foo Bar!',
    rating: 'G',
    tags: ['programming', 'foo-bar']
  },
  {
    id: 5,
    category: 'programming',
    setup: 'Why do programmers always mix up Halloween and Christmas?',
    punchline: 'Because Oct 31 = Dec 25!',
    rating: 'G',
    tags: ['programming', 'octal', 'decimal']
  },
  {
    id: 6,
    category: 'programming',
    setup: 'How do you comfort a JavaScript bug?',
    punchline: 'You console it!',
    rating: 'G',
    tags: ['programming', 'javascript', 'console']
  },
  {
    id: 7,
    category: 'programming',
    setup: 'Why did the developer go broke?',
    punchline: 'Because he used up all his cache!',
    rating: 'G',
    tags: ['programming', 'cache']
  },
  {
    id: 8,
    category: 'programming',
    setup: 'What do you call a programmer from Finland?',
    punchline: 'Nerdic!',
    rating: 'G',
    tags: ['programming', 'nordic']
  },
  {
    id: 9,
    category: 'programming',
    setup: 'Why don\'t programmers like nature?',
    punchline: 'It has too many bugs!',
    rating: 'G',
    tags: ['programming', 'bugs', 'nature']
  },
  {
    id: 10,
    category: 'programming',
    setup: 'What\'s the object-oriented way to become wealthy?',
    punchline: 'Inheritance!',
    rating: 'G',
    tags: ['programming', 'oop', 'inheritance']
  },
  {
    id: 11,
    category: 'programming',
    setup: 'Why was the JavaScript developer sad?',
    punchline: 'Because they didn\'t know how to \'null\' their emotions!',
    rating: 'G',
    tags: ['programming', 'javascript', 'null']
  },
  {
    id: 12,
    category: 'programming',
    setup: 'How does a programmer open a jar?',
    punchline: 'They use Java!',
    rating: 'G',
    tags: ['programming', 'java']
  },
  {
    id: 13,
    category: 'programming',
    setup: 'Why did the programmer quit their job?',
    punchline: 'Because they didn\'t get arrays!',
    rating: 'G',
    tags: ['programming', 'arrays', 'raises']
  },
  {
    id: 14,
    category: 'programming',
    setup: 'What do you call 8 hobbits?',
    punchline: 'A hobbyte!',
    rating: 'G',
    tags: ['programming', 'byte']
  },
  {
    id: 15,
    category: 'programming',
    setup: 'Why do Python programmers have bad eyesight?',
    punchline: 'They can\'t C!',
    rating: 'G',
    tags: ['programming', 'python', 'c']
  },
  {
    id: 16,
    category: 'programming',
    setup: 'What\'s a computer\'s favorite snack?',
    punchline: 'Microchips!',
    rating: 'G',
    tags: ['programming', 'computer', 'chips']
  },
  {
    id: 17,
    category: 'programming',
    setup: 'Why was the computer cold?',
    punchline: 'It left its Windows open!',
    rating: 'G',
    tags: ['programming', 'windows']
  },
  {
    id: 18,
    category: 'programming',
    setup: 'How do you generate a random string?',
    punchline: 'Put a Windows user in front of Vim!',
    rating: 'PG',
    tags: ['programming', 'vim', 'windows']
  },
  {
    id: 19,
    category: 'programming',
    setup: 'What do you call a busy server?',
    punchline: 'Swamped with requests!',
    rating: 'G',
    tags: ['programming', 'server', 'requests']
  },
  {
    id: 20,
    category: 'programming',
    setup: 'Why don\'t programmers like the outdoors?',
    punchline: 'There\'s no Ctrl+Z for real life!',
    rating: 'G',
    tags: ['programming', 'undo', 'ctrl-z']
  },

  // Dad Jokes (21-40)
  {
    id: 21,
    category: 'dad_jokes',
    setup: 'What do you call fake spaghetti?',
    punchline: 'An impasta!',
    rating: 'G',
    tags: ['dad-joke', 'food', 'pasta']
  },
  {
    id: 22,
    category: 'dad_jokes',
    setup: 'Why don\'t eggs tell jokes?',
    punchline: 'They\'d crack each other up!',
    rating: 'G',
    tags: ['dad-joke', 'eggs']
  },
  {
    id: 23,
    category: 'dad_jokes',
    setup: 'What do you call a fish wearing a bowtie?',
    punchline: 'Sofishticated!',
    rating: 'G',
    tags: ['dad-joke', 'fish', 'sophisticated']
  },
  {
    id: 24,
    category: 'dad_jokes',
    setup: 'Why did the scarecrow win an award?',
    punchline: 'He was outstanding in his field!',
    rating: 'G',
    tags: ['dad-joke', 'scarecrow']
  },
  {
    id: 25,
    category: 'dad_jokes',
    setup: 'What\'s brown and sticky?',
    punchline: 'A stick!',
    rating: 'G',
    tags: ['dad-joke', 'stick']
  },
  {
    id: 26,
    category: 'dad_jokes',
    setup: 'Why can\'t you hear a pterodactyl use the bathroom?',
    punchline: 'Because the \'P\' is silent!',
    rating: 'G',
    tags: ['dad-joke', 'dinosaur', 'silent-letter']
  },
  {
    id: 27,
    category: 'dad_jokes',
    setup: 'What do you call a bear with no teeth?',
    punchline: 'A gummy bear!',
    rating: 'G',
    tags: ['dad-joke', 'bear', 'teeth']
  },
  {
    id: 28,
    category: 'dad_jokes',
    setup: 'Why don\'t skeletons fight each other?',
    punchline: 'They don\'t have the guts!',
    rating: 'G',
    tags: ['dad-joke', 'skeleton', 'guts']
  },
  {
    id: 29,
    category: 'dad_jokes',
    setup: 'What do you call cheese that isn\'t yours?',
    punchline: 'Nacho cheese!',
    rating: 'G',
    tags: ['dad-joke', 'cheese', 'nacho']
  },
  {
    id: 30,
    category: 'dad_jokes',
    setup: 'How does a penguin build its house?',
    punchline: 'Igloos it together!',
    rating: 'G',
    tags: ['dad-joke', 'penguin', 'igloo']
  },
  {
    id: 31,
    category: 'dad_jokes',
    setup: 'What did the ocean say to the beach?',
    punchline: 'Nothing, it just waved!',
    rating: 'G',
    tags: ['dad-joke', 'ocean', 'wave']
  },
  {
    id: 32,
    category: 'dad_jokes',
    setup: 'Why did the bicycle fall over?',
    punchline: 'It was two-tired!',
    rating: 'G',
    tags: ['dad-joke', 'bicycle', 'tired']
  },
  {
    id: 33,
    category: 'dad_jokes',
    setup: 'What do you call a dinosaur with extensive vocabulary?',
    punchline: 'A thesaurus!',
    rating: 'G',
    tags: ['dad-joke', 'dinosaur', 'thesaurus']
  },
  {
    id: 34,
    category: 'dad_jokes',
    setup: 'Why don\'t scientists trust atoms?',
    punchline: 'Because they make up everything!',
    rating: 'G',
    tags: ['dad-joke', 'science', 'atoms']
  },
  {
    id: 35,
    category: 'dad_jokes',
    setup: 'What did one wall say to the other?',
    punchline: 'I\'ll meet you at the corner!',
    rating: 'G',
    tags: ['dad-joke', 'wall', 'corner']
  },
  {
    id: 36,
    category: 'dad_jokes',
    setup: 'Why did the math book look sad?',
    punchline: 'Because it had too many problems!',
    rating: 'G',
    tags: ['dad-joke', 'math', 'problems']
  },
  {
    id: 37,
    category: 'dad_jokes',
    setup: 'What do you call a parade of rabbits hopping backwards?',
    punchline: 'A receding hare-line!',
    rating: 'G',
    tags: ['dad-joke', 'rabbit', 'hairline']
  },
  {
    id: 38,
    category: 'dad_jokes',
    setup: 'How do you organize a space party?',
    punchline: 'You planet!',
    rating: 'G',
    tags: ['dad-joke', 'space', 'planet']
  },
  {
    id: 39,
    category: 'dad_jokes',
    setup: 'What\'s the best time to go to the dentist?',
    punchline: 'Tooth-hurty!',
    rating: 'G',
    tags: ['dad-joke', 'dentist', 'time']
  },
  {
    id: 40,
    category: 'dad_jokes',
    setup: 'Why did the cookie go to the doctor?',
    punchline: 'Because it felt crumbly!',
    rating: 'G',
    tags: ['dad-joke', 'cookie', 'doctor']
  },

  // Science Jokes (41-60)
  {
    id: 41,
    category: 'science',
    setup: 'What do you do with a sick chemist?',
    punchline: 'If you can\'t helium, and you can\'t curium, you might as well barium!',
    rating: 'G',
    tags: ['science', 'chemistry', 'elements']
  },
  {
    id: 42,
    category: 'science',
    setup: 'Why can\'t you trust an atom?',
    punchline: 'They make up everything!',
    rating: 'G',
    tags: ['science', 'atom', 'chemistry']
  },
  {
    id: 43,
    category: 'science',
    setup: 'What did the thermometer say to the graduated cylinder?',
    punchline: 'You may have graduated, but I have more degrees!',
    rating: 'G',
    tags: ['science', 'lab', 'degrees']
  },
  {
    id: 44,
    category: 'science',
    setup: 'Why did the physicist break up with the biologist?',
    punchline: 'There was no chemistry!',
    rating: 'G',
    tags: ['science', 'physics', 'biology']
  },
  {
    id: 45,
    category: 'science',
    setup: 'What is a physicist\'s favorite food?',
    punchline: 'Fission chips!',
    rating: 'G',
    tags: ['science', 'physics', 'fission']
  },
  {
    id: 46,
    category: 'science',
    setup: 'Why are chemists great at solving problems?',
    punchline: 'They have all the solutions!',
    rating: 'G',
    tags: ['science', 'chemistry', 'solutions']
  },
  {
    id: 47,
    category: 'science',
    setup: 'What do you call an educated tube?',
    punchline: 'A graduated cylinder!',
    rating: 'G',
    tags: ['science', 'lab', 'cylinder']
  },
  {
    id: 48,
    category: 'science',
    setup: 'Why don\'t electrons ever go to therapy?',
    punchline: 'They\'re always so negative!',
    rating: 'G',
    tags: ['science', 'electron', 'negative']
  },
  {
    id: 49,
    category: 'science',
    setup: 'How does the moon cut its hair?',
    punchline: 'Eclipse it!',
    rating: 'G',
    tags: ['science', 'moon', 'eclipse']
  },
  {
    id: 50,
    category: 'science',
    setup: 'What did the scientist say when he found 2 isotopes of helium?',
    punchline: 'HeHe!',
    rating: 'G',
    tags: ['science', 'chemistry', 'helium']
  },
  {
    id: 51,
    category: 'science',
    setup: 'Why did the germ cross the microscope?',
    punchline: 'To get to the other slide!',
    rating: 'G',
    tags: ['science', 'biology', 'microscope']
  },
  {
    id: 52,
    category: 'science',
    setup: 'What do you call a tooth in a glass of water?',
    punchline: 'One molar solution!',
    rating: 'G',
    tags: ['science', 'chemistry', 'molar']
  },
  {
    id: 53,
    category: 'science',
    setup: 'Why are mitochondria so popular?',
    punchline: 'They\'re the powerhouse of the cell!',
    rating: 'G',
    tags: ['science', 'biology', 'mitochondria']
  },
  {
    id: 54,
    category: 'science',
    setup: 'What did one DNA say to another?',
    punchline: 'Do these genes make me look fat?',
    rating: 'PG',
    tags: ['science', 'biology', 'dna']
  },
  {
    id: 55,
    category: 'science',
    setup: 'Why did the white bear dissolve in water?',
    punchline: 'It was polar!',
    rating: 'G',
    tags: ['science', 'chemistry', 'polar']
  },
  {
    id: 56,
    category: 'science',
    setup: 'What is the fastest way to determine the sex of a chromosome?',
    punchline: 'Pull down its genes!',
    rating: 'PG',
    tags: ['science', 'biology', 'genes']
  },
  {
    id: 57,
    category: 'science',
    setup: 'Why don\'t biologists like to exercise?',
    punchline: 'They get too out of breath!',
    rating: 'G',
    tags: ['science', 'biology', 'breath']
  },
  {
    id: 58,
    category: 'science',
    setup: 'What did the limestone say to the geologist?',
    punchline: 'Don\'t take me for granite!',
    rating: 'G',
    tags: ['science', 'geology', 'granite']
  },
  {
    id: 59,
    category: 'science',
    setup: 'Why are protons more positive than neutrons?',
    punchline: 'They know they matter!',
    rating: 'G',
    tags: ['science', 'physics', 'proton']
  },
  {
    id: 60,
    category: 'science',
    setup: 'What do you call a clown in jail?',
    punchline: 'A silicon!',
    rating: 'G',
    tags: ['science', 'chemistry', 'silicon']
  },

  // Animal Jokes (61-80)
  {
    id: 61,
    category: 'animals',
    setup: 'What do you call a sleeping bull?',
    punchline: 'A bulldozer!',
    rating: 'G',
    tags: ['animals', 'bull', 'bulldozer']
  },
  {
    id: 62,
    category: 'animals',
    setup: 'What do you call an alligator in a vest?',
    punchline: 'An investigator!',
    rating: 'G',
    tags: ['animals', 'alligator', 'investigator']
  },
  {
    id: 63,
    category: 'animals',
    setup: 'Why don\'t oysters donate to charity?',
    punchline: 'Because they\'re shellfish!',
    rating: 'G',
    tags: ['animals', 'oyster', 'shellfish']
  },
  {
    id: 64,
    category: 'animals',
    setup: 'What do you call a pile of cats?',
    punchline: 'A meowtain!',
    rating: 'G',
    tags: ['animals', 'cat', 'mountain']
  },
  {
    id: 65,
    category: 'animals',
    setup: 'Why don\'t ants get sick?',
    punchline: 'They have tiny ant-ibodies!',
    rating: 'G',
    tags: ['animals', 'ant', 'antibodies']
  },
  {
    id: 66,
    category: 'animals',
    setup: 'What do you call a cow with no legs?',
    punchline: 'Ground beef!',
    rating: 'PG',
    tags: ['animals', 'cow', 'beef']
  },
  {
    id: 67,
    category: 'animals',
    setup: 'Why do cows have hooves instead of feet?',
    punchline: 'Because they lactose!',
    rating: 'G',
    tags: ['animals', 'cow', 'lactose']
  },
  {
    id: 68,
    category: 'animals',
    setup: 'What\'s orange and sounds like a parrot?',
    punchline: 'A carrot!',
    rating: 'G',
    tags: ['animals', 'parrot', 'carrot']
  },
  {
    id: 69,
    category: 'animals',
    setup: 'Why don\'t elephants use computers?',
    punchline: 'They\'re afraid of the mouse!',
    rating: 'G',
    tags: ['animals', 'elephant', 'computer']
  },
  {
    id: 70,
    category: 'animals',
    setup: 'What do you call a fish without eyes?',
    punchline: 'Fsh!',
    rating: 'G',
    tags: ['animals', 'fish', 'eyes']
  },
  {
    id: 71,
    category: 'animals',
    setup: 'Why did the chicken join a band?',
    punchline: 'Because it had the drumsticks!',
    rating: 'G',
    tags: ['animals', 'chicken', 'drumsticks']
  },
  {
    id: 72,
    category: 'animals',
    setup: 'What do you call a lazy kangaroo?',
    punchline: 'A pouch potato!',
    rating: 'G',
    tags: ['animals', 'kangaroo', 'couch-potato']
  },
  {
    id: 73,
    category: 'animals',
    setup: 'Why do seagulls fly over the sea?',
    punchline: 'Because if they flew over the bay, they\'d be bagels!',
    rating: 'G',
    tags: ['animals', 'seagull', 'bagel']
  },
  {
    id: 74,
    category: 'animals',
    setup: 'What do you call a bear in the rain?',
    punchline: 'A drizzly bear!',
    rating: 'G',
    tags: ['animals', 'bear', 'grizzly']
  },
  {
    id: 75,
    category: 'animals',
    setup: 'Why don\'t cats play poker in the jungle?',
    punchline: 'Too many cheetahs!',
    rating: 'G',
    tags: ['animals', 'cat', 'cheetah']
  },
  {
    id: 76,
    category: 'animals',
    setup: 'What do you call a dog magician?',
    punchline: 'A labracadabrador!',
    rating: 'G',
    tags: ['animals', 'dog', 'labrador']
  },
  {
    id: 77,
    category: 'animals',
    setup: 'Why did the duck go to the doctor?',
    punchline: 'He was feeling a little down!',
    rating: 'G',
    tags: ['animals', 'duck', 'down']
  },
  {
    id: 78,
    category: 'animals',
    setup: 'What\'s a cat\'s favorite color?',
    punchline: 'Purrr-ple!',
    rating: 'G',
    tags: ['animals', 'cat', 'purple']
  },
  {
    id: 79,
    category: 'animals',
    setup: 'Why don\'t sheep tell jokes?',
    punchline: 'They\'d just get the flock laughing!',
    rating: 'G',
    tags: ['animals', 'sheep', 'flock']
  },
  {
    id: 80,
    category: 'animals',
    setup: 'What do you call a snake that works for the government?',
    punchline: 'A civil serpent!',
    rating: 'G',
    tags: ['animals', 'snake', 'civil-servant']
  },

  // Food Jokes (81-100)
  {
    id: 81,
    category: 'food',
    setup: 'Why did the tomato turn red?',
    punchline: 'Because it saw the salad dressing!',
    rating: 'G',
    tags: ['food', 'tomato', 'salad']
  },
  {
    id: 82,
    category: 'food',
    setup: 'What do you call a fake noodle?',
    punchline: 'An impasta!',
    rating: 'G',
    tags: ['food', 'pasta', 'impostor']
  },
  {
    id: 83,
    category: 'food',
    setup: 'Why did the banana go to the doctor?',
    punchline: 'It wasn\'t peeling well!',
    rating: 'G',
    tags: ['food', 'banana', 'peeling']
  },
  {
    id: 84,
    category: 'food',
    setup: 'What do you call a sad coffee?',
    punchline: 'Depresso!',
    rating: 'G',
    tags: ['food', 'coffee', 'espresso']
  },
  {
    id: 85,
    category: 'food',
    setup: 'Why did the cookie cry?',
    punchline: 'Because its mother was a wafer so long!',
    rating: 'G',
    tags: ['food', 'cookie', 'wafer']
  },
  {
    id: 86,
    category: 'food',
    setup: 'What\'s a vampire\'s favorite fruit?',
    punchline: 'A neck-tarine!',
    rating: 'G',
    tags: ['food', 'fruit', 'nectarine']
  },
  {
    id: 87,
    category: 'food',
    setup: 'Why don\'t eggs tell each other secrets?',
    punchline: 'They might crack up!',
    rating: 'G',
    tags: ['food', 'eggs', 'crack']
  },
  {
    id: 88,
    category: 'food',
    setup: 'What do you call a cheese that isn\'t yours?',
    punchline: 'Nacho cheese!',
    rating: 'G',
    tags: ['food', 'cheese', 'nacho']
  },
  {
    id: 89,
    category: 'food',
    setup: 'Why did the lettuce win the race?',
    punchline: 'Because it was ahead!',
    rating: 'G',
    tags: ['food', 'lettuce', 'ahead']
  },
  {
    id: 90,
    category: 'food',
    setup: 'What do you call a sleeping pizza?',
    punchline: 'A piZZZa!',
    rating: 'G',
    tags: ['food', 'pizza', 'sleep']
  },
  {
    id: 91,
    category: 'food',
    setup: 'Why did the orange stop rolling down the hill?',
    punchline: 'It ran out of juice!',
    rating: 'G',
    tags: ['food', 'orange', 'juice']
  },
  {
    id: 92,
    category: 'food',
    setup: 'What\'s a potato\'s favorite TV show?',
    punchline: 'Starch Trek!',
    rating: 'G',
    tags: ['food', 'potato', 'star-trek']
  },
  {
    id: 93,
    category: 'food',
    setup: 'Why don\'t melons get married?',
    punchline: 'Because they cantaloupe!',
    rating: 'G',
    tags: ['food', 'melon', 'cantaloupe']
  },
  {
    id: 94,
    category: 'food',
    setup: 'What do you call a grumpy bread?',
    punchline: 'Sourdough!',
    rating: 'G',
    tags: ['food', 'bread', 'sourdough']
  },
  {
    id: 95,
    category: 'food',
    setup: 'Why did the grape stop in the middle of the road?',
    punchline: 'Because it ran out of juice!',
    rating: 'G',
    tags: ['food', 'grape', 'juice']
  },
  {
    id: 96,
    category: 'food',
    setup: 'What\'s the best thing to put in a pie?',
    punchline: 'Your teeth!',
    rating: 'G',
    tags: ['food', 'pie', 'teeth']
  },
  {
    id: 97,
    category: 'food',
    setup: 'Why did the mushroom go to the party?',
    punchline: 'Because he was a fungi!',
    rating: 'G',
    tags: ['food', 'mushroom', 'fun-guy']
  },
  {
    id: 98,
    category: 'food',
    setup: 'What do you call a cow that eats your grass?',
    punchline: 'A lawn mooer!',
    rating: 'G',
    tags: ['food', 'cow', 'lawnmower']
  },
  {
    id: 99,
    category: 'food',
    setup: 'Why did the apple go to school?',
    punchline: 'To become a smartie!',
    rating: 'G',
    tags: ['food', 'apple', 'smart']
  },
  {
    id: 100,
    category: 'food',
    setup: 'What do you call a stolen yam?',
    punchline: 'A hot potato!',
    rating: 'G',
    tags: ['food', 'yam', 'potato']
  }
];

module.exports = { jokes };
