/**
 * The fixed choices the pre-chat form offers, shared so the widget's `<select>`,
 * the server's validation and the admin's filters can never drift apart.
 *
 * Both lists are closed sets: anything not in them is rejected by the server.
 * That is what keeps the admin's filters meaningful — a free-text city field
 * would fill up with "lahore", "Lahore ", "LHR" and be useless to group by.
 */

export const MaritalStatus = {
  SINGLE: "SINGLE",
  MARRIED: "MARRIED",
  DIVORCED: "DIVORCED",
  SEPARATED: "SEPARATED",
  WIDOWED: "WIDOWED",
} as const;
export type MaritalStatus = (typeof MaritalStatus)[keyof typeof MaritalStatus];

export const MARITAL_STATUSES = [
  "SINGLE",
  "MARRIED",
  "DIVORCED",
  "SEPARATED",
  "WIDOWED",
] as const satisfies readonly MaritalStatus[];

/** What each value is called on screen. Stored as the enum, never the label. */
export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  SINGLE: "Single",
  MARRIED: "Married",
  DIVORCED: "Divorced",
  SEPARATED: "Separated",
  WIDOWED: "Widowed",
};

/**
 * Cities grouped by province and territory, which is also how the form's
 * `<optgroup>`s are drawn — a flat list of this length is unusable on a phone.
 *
 * "Other" is deliberately last and deliberately present: a visitor from a town
 * not listed here must still be able to finish the form.
 */
export const PAKISTAN_CITY_GROUPS = [
  {
    province: "Islamabad Capital Territory",
    cities: ["Islamabad"],
  },
  {
    province: "Punjab",
    cities: [
      "Ahmadpur East",
      "Alipur",
      "Arifwala",
      "Attock",
      "Bahawalnagar",
      "Bahawalpur",
      "Bhakkar",
      "Bhalwal",
      "Burewala",
      "Chakwal",
      "Chiniot",
      "Chishtian",
      "Chunian",
      "Daska",
      "Depalpur",
      "Dera Ghazi Khan",
      "Dinga",
      "Dunyapur",
      "Faisalabad",
      "Fateh Jang",
      "Fort Abbas",
      "Gojra",
      "Gujar Khan",
      "Gujranwala",
      "Gujrat",
      "Hafizabad",
      "Haroonabad",
      "Hasan Abdal",
      "Hasilpur",
      "Jalalpur Jattan",
      "Jampur",
      "Jaranwala",
      "Jauharabad",
      "Jhang",
      "Jhelum",
      "Kabirwala",
      "Kahuta",
      "Kamalia",
      "Kamoke",
      "Karor Lal Esan",
      "Kasur",
      "Khanewal",
      "Khanpur",
      "Kharian",
      "Khushab",
      "Kot Addu",
      "Lahore",
      "Layyah",
      "Lodhran",
      "Mandi Bahauddin",
      "Mian Channu",
      "Mianwali",
      "Multan",
      "Murree",
      "Muridke",
      "Muzaffargarh",
      "Nankana Sahib",
      "Narowal",
      "Okara",
      "Pakpattan",
      "Pattoki",
      "Phalia",
      "Pind Dadan Khan",
      "Pindi Bhattian",
      "Pindigheb",
      "Quaidabad",
      "Rahim Yar Khan",
      "Raiwind",
      "Rajanpur",
      "Rawalpindi",
      "Renala Khurd",
      "Sadiqabad",
      "Sahiwal",
      "Sambrial",
      "Sarai Alamgir",
      "Sargodha",
      "Shakargarh",
      "Sheikhupura",
      "Shorkot",
      "Sialkot",
      "Talagang",
      "Taunsa",
      "Taxila",
      "Toba Tek Singh",
      "Vehari",
      "Wah Cantonment",
      "Wazirabad",
      "Yazman",
      "Zafarwal",
    ],
  },
  {
    province: "Sindh",
    cities: [
      "Badin",
      "Bhiria",
      "Dadu",
      "Daharki",
      "Digri",
      "Gambat",
      "Ghotki",
      "Golarchi",
      "Hala",
      "Hyderabad",
      "Jacobabad",
      "Jamshoro",
      "Kandhkot",
      "Karachi",
      "Kashmore",
      "Khairpur",
      "Kotri",
      "Kunri",
      "Larkana",
      "Matiari",
      "Mehar",
      "Mirpur Khas",
      "Mithi",
      "Moro",
      "Naushahro Feroze",
      "Nawabshah",
      "Pano Aqil",
      "Qambar",
      "Ratodero",
      "Rohri",
      "Sanghar",
      "Sehwan",
      "Shahdadkot",
      "Shikarpur",
      "Sujawal",
      "Sukkur",
      "Tando Adam",
      "Tando Allahyar",
      "Tando Muhammad Khan",
      "Thatta",
      "Umerkot",
      "Warah",
    ],
  },
  {
    province: "Khyber Pakhtunkhwa",
    cities: [
      "Abbottabad",
      "Alpuri",
      "Bannu",
      "Batkhela",
      "Battagram",
      "Charsadda",
      "Chitral",
      "Daggar",
      "Dargai",
      "Dera Ismail Khan",
      "Hangu",
      "Haripur",
      "Havelian",
      "Jamrud",
      "Kalaya",
      "Karak",
      "Khar",
      "Kohat",
      "Lakki Marwat",
      "Landi Kotal",
      "Malakand",
      "Mansehra",
      "Mardan",
      "Mingora",
      "Miranshah",
      "Nowshera",
      "Pabbi",
      "Parachinar",
      "Peshawar",
      "Risalpur",
      "Shabqadar",
      "Swabi",
      "Takht Bhai",
      "Tank",
      "Timergara",
      "Topi",
      "Utmanzai",
      "Wana",
    ],
  },
  {
    province: "Balochistan",
    cities: [
      "Awaran",
      "Barkhan",
      "Bhag",
      "Chaman",
      "Dalbandin",
      "Dera Allah Yar",
      "Dera Murad Jamali",
      "Duki",
      "Gwadar",
      "Harnai",
      "Hub",
      "Kalat",
      "Kharan",
      "Khuzdar",
      "Loralai",
      "Mastung",
      "Musakhel",
      "Nushki",
      "Panjgur",
      "Pishin",
      "Qila Abdullah",
      "Qila Saifullah",
      "Quetta",
      "Sibi",
      "Sohbatpur",
      "Surab",
      "Turbat",
      "Usta Muhammad",
      "Uthal",
      "Washuk",
      "Zhob",
      "Ziarat",
    ],
  },
  {
    province: "Azad Jammu & Kashmir",
    cities: [
      "Athmuqam",
      "Bagh",
      "Bhimber",
      "Forward Kahuta",
      "Hattian Bala",
      "Kotli",
      "Mirpur",
      "Muzaffarabad",
      "Pallandri",
      "Rawalakot",
    ],
  },
  {
    province: "Gilgit-Baltistan",
    cities: [
      "Astore",
      "Chilas",
      "Darel",
      "Gahkuch",
      "Gilgit",
      "Karimabad",
      "Khaplu",
      "Kharmang",
      "Nagar",
      "Roundu",
      "Shigar",
      "Skardu",
      "Tangir",
    ],
  },
] as const;

/**
 * For a visitor whose town is not on the list. Kept out of the groups so it can
 * be rendered last, on its own, rather than buried under a province.
 */
export const OTHER_CITY = "Other";

/** Every accepted value as one flat list, which is what validation checks. */
export const PAKISTAN_CITIES: readonly string[] = [
  ...PAKISTAN_CITY_GROUPS.flatMap((group) => group.cities),
  OTHER_CITY,
];

/**
 * The identity a phone number reduces to: digits only, with Pakistan's country
 * code, so `+92 300 1234567`, `0300 1234567` and `03001234567` are one person
 * rather than three.
 *
 * Mirrors the SQL in the `visitor_profile_phone_identity` migration step for
 * step. If you change one, change the other, or rows written before and after
 * the change stop matching each other.
 */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && !digits.startsWith("92")) digits = `92${digits}`;
  return digits;
}
