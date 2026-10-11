"""Builds docs/research/HOOKS_2026-10-11.md and the 06_HOOKS CSV from TikTok data.

Every hook is adapted from a real carousel (handle, views, saves measured on
2026-10-11 through TikTok's web API: the operator's "Carrousel template cf"
collection plus keyword searches on cortisol, hormones, nervous system,
anxiety, burnout, meditation and sleep). Run: python3 scripts/research/hooks-2026-10-11.py
"""
import csv
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]

# (format, hook, shape, source handle, source hook as posted, views, saves)
HOOKS = [
    # F01 lifestyle photo dump: a list of habits, each slide = 3 photos of one habit.
    ("F01", "weird hacks from my therapist that actually calmed my cortisol", "authority confession + list", "anxiousgirliediaries_", "weird hacks from my therapist that helped me stop my anxiety (they really work)", 3000000, 113071),
    ("F01", "high maintenance habits i do so my hormones stay low maintenance", "paradox list", "beautywithmari", "high maintenance things i do to stay low maintenance", 19100000, 640827),
    ("F01", "6 habits that did more for my hormones than any supplement", "comparison claim", "iheartliver", "6 habits that changed my health more than any supplement", 229600, 12529),
    ("F01", "simple anxiety hacks my therapist taught me (that actually helped)", "authority confession", "nourbur.1", "simple anxiety hacks my therapist taught me (that actually helped)", 374400, 10847),
    ("F01", "self care habits i live by as a girl with high cortisol", "identity list", "lilybayliss_", "self care habits i live by (as a certified wellness girlie)", 197100, 3761),
    ("F01", "wellness habits i wish i started at 20", "regret list", "m.adeleinejane", "wellness habits i wish i started sooner", 192200, 13135),
    ("F01", "niche habits that changed my mood in two weeks", "niche + timeframe", "better.with.ava", "niche habits to completely change your life in two weeks", 284800, 14920),
    ("F01", "small habits that healed my nervous system long term", "small habits", "holistclotus", "small healthy habits to heal in and out in long term", 241900, 12748),
    ("F01", "the real chill pills: habits that calm my body down", "playful reframe", "forlovergirlz", "the real chill pills!!", 650700, 44486),
    ("F01", "top 5 ways i relieve stress (number 5 is so underrated)", "ranked teaser", "ysa.berenaa", "top 5 best ways to relieve stress", 3000000, 30928),
    ("F01", "how lowering my cortisol made me feel prettier and more confident", "outcome promise", "psychpremed", "how lowering your cortisol makes you hotter & more confident", 1900000, 87529),
    ("F01", "5 ways i take care of my mental health without therapy money", "constraint list", "selfcaremastermind", "take care of your mental health (5 ways)", 1700000, 73406),
    ("F01", "glow up habits that are secretly hormone habits", "reframe", "diarywithglow", "how to glow up in 2026", 2600000, 101341),
    ("F01", "actual niche cortisol tips instead of the 5 same ones", "anti-cliche", "shyfortzu", "actual NICHE glow up tips instead of the five same ones", 184500, 8828),
    ("F01", "things i stopped doing once i learned about cortisol", "stopped list", "rockyjune00", "how you lower your cortisol", 137100, 5471),
    ("F01", "how i rebuilt my brain after burnout (when everyone said i'd never be the same)", "transformation story", "emily.mentalhealth", "how i rebuilt my brain after complete burnout", 125100, 3562),
    ("F01", "your glow up before 2026 ends starts with your nervous system", "deadline", "fallwithem", "your glow up before 2026 ends", 1200000, 78367),
    ("F01", "habits that made my anxiety so much quieter", "result list", "theeverydaygirlsguide", "unhinged things to do when you feel anxiety coming", 485500, 15281),
    ("F01", "little things that lowered my cortisol without trying hard", "low effort", "aliceinlace_", "9 habits that will help you reduce cortisol", 137000, 5542),
    ("F01", "how to actually lower your cortisol (not the obvious stuff)", "actually + contrast", "motiondreambig", "how to actually lower your cortisol", 107900, 4180),

    # F03 routine timeline: one full-screen photo per timed step.
    ("F03", "my morning routine to lower cortisol", "routine + goal", "claiirecosta", "my morning routine to lower cortisol *as a adhd wellness lover*", 249700, 10843),
    ("F03", "pcos girl night routine", "identity routine", "thegirlshubuk", "PCOS girl night routine", 203100, 2980),
    ("F03", "morning routine that keeps my cortisol low all day", "routine + result", "fa_4355", "7:00 - 8:15 morning routine", 1900000, 31443),
    ("F03", "my night routine when my brain won't shut off", "problem routine", "wellnessabyv", "sleep hygiene tips", 1300000, 38439),
    ("F03", "the morning routine that fixed my hormones", "routine + result", "chasingpeaks0", "the morning routine that ACTUALLY raises testosterone (according to science)", 276200, 11917),
    ("F03", "my low cortisol morning (no coffee for 90 min)", "routine + rule", "30glowup.app", "how to lower your cortisol in 10 days (day 1-2: fix your mornings)", 787900, 29692),
    ("F03", "pov: you're a pcos girl balancing your hormones before bed", "pov identity", "thegirlshubuk", "pov: you're a pcos girl trying to balance your hormones before bed", 203100, 2980),
    ("F03", "my morning routine as someone with anxiety", "identity routine", "claiirecosta", "my morning routine to lower cortisol *as a adhd wellness lover*", 249700, 10843),
    ("F03", "what i do the first hour after waking up to keep cortisol low", "first hour", "chasingpeaks0", "why the morning matters", 276200, 11917),
    ("F03", "my luteal phase evening routine", "cycle routine", "rorareset", "women's health (cycle phases)", 1400000, 75127),
    ("F03", "my sunday reset for my nervous system", "reset ritual", "beautywithmari", "maintenance day", 19100000, 640827),
    ("F03", "the night routine that finally fixed my sleep", "result routine", "wellnessabyv", "sleep hygiene", 1300000, 38439),
    ("F03", "my after-work routine so i don't stay in fight or flight", "problem routine", "wagamamalover", "how to regulate your nervous system", 229700, 14314),
    ("F03", "my morning routine on days my anxiety is loud", "condition routine", "realtalkwithang", "save this when your anxiety starts taking over", 322100, 5469),
    ("F03", "realistic morning routine for hormone balance (no 5am)", "realistic + rule", "toriwaterss_", "my morning routine", 632300, 7844),
    ("F03", "my period week routine for less cramps and moods", "cycle routine", "humanoptimizationlab", "understanding cravings and mood swings", 1200000, 88690),
    ("F03", "how i spend my evenings since i stopped doomscrolling", "change routine", "motiondreambig", "doomscrolling break", 107900, 4180),
    ("F03", "the cortisol-friendly morning i swear by", "endorsement", "caroline__mchugh", "lowering cortisol", 2200000, 68215),
    ("F03", "my 10 minute nervous system reset before bed", "short routine", "bina.frequencies", "the 20-second nervous system reset", 2200000, 32758),
    ("F03", "day in my life healing burnout", "healing diary", "emily.mentalhealth", "how i recovered from severe burnout", 125100, 3562),

    # F04 educational: three sections (signs / why / what to do).
    ("F04", "signs your cortisol is high (no test needed)", "self-diagnosis", "mimii_unfiltered", "10 signs your cortisol (stress hormone) is too high, no test needed", 1100000, 4688),
    ("F04", "important things women aren't taught about their hormones", "taboo knowledge", "rorareset", "important things us women are not taught in school or by society", 1400000, 75127),
    ("F04", "5 signs you're burnt out (and not just tired)", "signs + contrast", "things_explained0", "5 signs you're burnt out (and not just tired)", 1200000, 26901),
    ("F04", "signs your hormones are a mess", "self-diagnosis", "siuelaclub", "signs your hormones are a mess", 340500, 4191),
    ("F04", "women aren't under-eating, they're under-nourished", "reframe statement", "humanoptimizationlab", "women aren't under-eating. they are under-nourished.", 1200000, 88690),
    ("F04", "3 hormones your body releases and how to trigger them naturally", "explainer", "rhea.cycle", "3 hormones your body releases: how to trigger them naturally", 138700, 7816),
    ("F04", "8 things that quietly mess up your hormones", "causes list", "liz_oma", "8 things that causes hormonal imbalance", 1100000, 3020),
    ("F04", "what high cortisol does to your face", "visible effect", "ouad.ez", "effects of cortisol on face", 2600000, 5989),
    ("F04", "find your stress belly type", "quiz", "liloubites", "find your belly type", 7800000, 36569),
    ("F04", "how to balance your hormones naturally (what your doctor might not tell you)", "insider", "thenourishingplate", "how to balance hormones naturally: what your doctor might not tell you", 161100, 10255),
    ("F04", "how to regulate your nervous system, from someone who had a dysregulated one", "lived authority", "wagamamalover", "how to regulate your nervous system, from someone who had a disregulated nervous system", 229700, 14314),
    ("F04", "this happens when you take magnesium every night", "consequence", "anxietyfree.tv", "this happens if you take magnesium", 276400, 2479),
    ("F04", "i was diagnosed with pcos 4 years ago, here's everything i wish i knew", "diagnosis story", "maya.tipss", "i was officially diagnosed with pcos 4 years ago, here's everything i wish i knew then", 245500, 9919),
    ("F04", "how to meditate (for beginners who can't sit still)", "beginner guide", "monk.mogul", "how to meditate (for beginners)", 1100000, 61831),
    ("F04", "your hormones are running your life, here's how to take it back", "provocation", "rhea.cycle", "your hormones are controlling your life FIX IT!", 138700, 7816),
    ("F04", "5 nervous system hacks my therapist taught me", "authority list", "forlovergirlz", "5 nervous system hacks my therapist taught me (these actually chilled me out)", 650700, 44486),
    ("F04", "why you're tired but wired at night", "symptom explainer", "rhea.cycle", "melatonin: tired but wired", 138700, 7816),
    ("F04", "cortisol reducing foods i actually eat", "foods list", "naturallywellness", "signs your cortisol is high / cortisol-reducing foods", 1300000, 33081),
    ("F04", "your menstrual cycle isn't just about periods", "myth bust", "rorareset", "the menstrual cycle isn't just about periods", 1400000, 75127),
    ("F04", "what burnout actually does to your brain", "mechanism", "things_explained0", "5 signs you are burned out", 1200000, 26901),

    # F05 notes checklist: a quoted first-person thought, then iOS Notes lists.
    ("F05", "“i want to lower my cortisol but idk where to start”", "quoted thought", "caroline__mchugh", "\"i want to lower my cortisol but idk where to start\"", 2200000, 68215),
    ("F05", "steal my master list of the easiest ways to calm my hormones", "steal my list", "katieleexoxoxo", "steal my master list of the easiest ways to glow up quick", 1700000, 121728),
    ("F05", "“i want to fix my hormones but i don't know where to begin”", "quoted thought", "primustheino", "« je veux commencer à bien manger mais je sais pas par où commencer »", 10600, 719),
    ("F05", "my notes app list for when my anxiety spikes", "notes app list", "realtalkwithang", "save this when your anxiety starts taking over", 322100, 5469),
    ("F05", "save this for when your cortisol is through the roof", "save-for-later", "realtalkwithang", "save this when your anxiety starts taking over", 322100, 5469),
    ("F05", "“why am i so tired when i slept 8 hours”", "quoted problem", "things_explained0", "you're tired no matter how much you sleep", 1200000, 26901),
    ("F05", "my 10 day cortisol reset list (no supplements, no bs)", "challenge list", "30glowup.app", "how to lower your cortisol in 10 days, no supplements, no bs", 787900, 29692),
    ("F05", "10 days hormone glow up challenge", "challenge", "thatgirl_guide0", "10 days glow up challenge", 1300000, 50988),
    ("F05", "the silent face puffers list vs the face debloat list", "two lists", "glowsy.debloat", "the silent face puffer list / the face debloat list", 266200, 3061),
    ("F05", "“i want to feel calm again without quitting my life”", "quoted wish", "caroline__mchugh", "\"i want to lower my cortisol but idk where to start\"", 2200000, 68215),
    ("F05", "the lazy girl hormone checklist", "lazy girl", "girlsonlyfinds", "the lazy girl glow-up checklist", 1922, 57),
    ("F05", "my pcos grocery list (screenshot this)", "screenshot list", "maya.tipss", "pcos tips", 245500, 9919),
    ("F05", "things i do every day for my nervous system", "daily list", "selfcaremastermind", "take care of your mental health", 1700000, 73406),
    ("F05", "“my cortisol face is back again”", "quoted problem", "sarazelko", "get those cortisol levels down babe", 2700000, 2514),
    ("F05", "everything i'd do if i had to fix burnout from zero", "if i had to", "emily.mentalhealth", "how i recovered from severe burnout", 125100, 3562),
    ("F05", "my anti-anxiety notes for bad days", "notes app", "anxiousgirliediaries_", "weird hacks from my therapist (they really work)", 3000000, 113071),
    ("F05", "screenshot this if your hormones feel out of control", "screenshot cta hook", "katieleexoxoxo", "steal my master list", 1700000, 121728),
    ("F05", "“i feel wired all day and exhausted at night”", "quoted symptom", "mimii_unfiltered", "you wake up tired but can't sleep at night", 1100000, 4688),
    ("F05", "what i'd tell my 20 year old self about hormones", "letter to self", "rorareset", "important things us women are not taught", 1400000, 75127),
    ("F05", "my sleep checklist for when my brain won't stop", "notes app", "wellnessabyv", "sleep hygiene", 1300000, 38439),

    # F07 tier list: worst tier first, best last.
    ("F07", "evening habits tier list for your cortisol (backed by science)", "tier + science", "ryestetics", "evening habits tier list (backed by science)", 1100000, 35930),
    ("F07", "sleep habits tier list (backed by science)", "tier + science", "sched.ai", "sleep habits tier list (backed by science)", 74700, 946),
    ("F07", "tier list of mental health habits, ranked by how much they actually help", "tier + honesty", "mentalapp", "tier list of mentalmaxxing things", 105100, 1825),
    ("F07", "ranking stress relief habits from useless to life changing", "ranking range", "ysa.berenaa", "top 5 best ways to relieve stress", 3000000, 30928),
    ("F07", "workouts tier list for women with high cortisol", "tier + identity", "bnhealth", "sports tier list (for optimal health)", 817100, 7183),
    ("F07", "morning habits tier list for your hormones", "tier", "primal_eur", "physical activity tier list for optimal health", 301000, 3972),
    ("F07", "cortisol tier list: what actually lowers it", "tier + actually", "primal_eur", "job tier list for optimal health (cortisol meter)", 1500000, 10704),
    ("F07", "ranking viral wellness trends as someone with pcos", "ranking as someone who", "primal_eur", "diets tier list", 266100, 5510),
    ("F07", "anxiety hacks tier list (some of these are useless)", "tier + warning", "theeverydaygirlsguide", "unhinged things to do when anxiety hits", 485500, 15281),
    ("F07", "caffeine habits tier list for your cortisol", "tier", "ryestetics", "F+ tier: late caffeine and alcohol", 1100000, 35930),
    ("F07", "supplements tier list for hormones (honest)", "tier + honest", "anxietyfree.tv", "this happens if you take magnesium", 276400, 2479),
    ("F07", "ranking self care trends by what actually moved my mood", "ranking range", "beautywithmari", "high maintenance things", 19100000, 640827),
    ("F07", "breakfast tier list for steady energy", "tier", "zexxicek_", "low cortisol breakfast", 355400, 4914),
    ("F07", "phone habits tier list for your nervous system", "tier", "mentalapp", "screen time control in tier list", 105100, 1825),
    ("F07", "period symptoms relief tier list", "tier", "humanoptimizationlab", "cravings and mood swings", 1200000, 88690),
    ("F07", "ranking walks, pilates, hiit and yoga for high cortisol", "versus ranking", "bnhealth", "sports tier list", 817100, 7183),
    ("F07", "sleep tricks tier list from someone who used to sleep 4 hours", "tier + lived", "sched.ai", "sleep habits tier list", 74700, 946),
    ("F07", "environment tier list for a calm brain", "tier", "primal_eur", "environment tier list for optimal human health", 133800, 1977),
    ("F07", "evening drinks tier list for better sleep", "tier", "ryestetics", "evening habits tier list", 1100000, 35930),
    ("F07", "ranking meditation styles for people who hate meditating", "ranking for haters", "yasmin.1199", "meditation", 612700, 43698),

    # F08 2x2: contrast, before/after, versus.
    ("F08", "my face before i managed my cortisol vs now", "before / now", "raquelallenn", "my face before i managed my cortisol", 670700, 3107),
    ("F08", "low cortisol vs rising cortisol", "versus", "ouad.ez", "low cortisol / rising cortisol", 2600000, 5989),
    ("F08", "girls scared of aging, this is what lower cortisol did to my face", "fear + proof", "elizabethashlen", "girls scared of aging", 3600000, 2884),
    ("F08", "before cortisol face vs after cortisol face", "before / after", "sarazelko", "before cortisol face / after cortisol face", 2700000, 2514),
    ("F08", "avant : cortisol élevé, après : cortisol bas", "before / after (fr)", "nuclever", "avant : cortisol élevé / après : un taux réduit de cortisol", 731800, 1794),
    ("F08", "pcos core before vs now", "identity before / now", "linae7777", "PCOS core (growing a beard) before / now", 204300, 2755),
    ("F08", "high cortisol habits vs low cortisol habits", "versus habits", "takeprince", "buying real designer vs making your own designer (cortisol meter)", 196900, 1748),
    ("F08", "anxious me vs regulated me", "versus self", "wagamamalover", "how to regulate your nervous system", 229700, 14314),
    ("F08", "10,000 steps every day: my body before vs after 3 months", "habit + before/after", "fallwithem", "10,000 steps every day", 1200000, 78367),
    ("F08", "what i ate when i was burnt out vs what i eat now", "versus food", "humanoptimizationlab", "women aren't under-eating, they're under-nourished", 1200000, 88690),
    ("F08", "my mornings at high cortisol vs my mornings now", "versus routine", "claiirecosta", "my morning routine to lower cortisol", 249700, 10843),
    ("F08", "stressed girl starter pack vs calm girl starter pack", "starter pack", "takeprince", "real designer vs your own designer", 196900, 1748),
    ("F08", "after 3 months of fixing my hormones", "timeframe result", "amina.beautyy", "après 3 mois de cure", 1000000, 6974),
    ("F08", "doomscrolling at 1am vs reading at 10pm", "versus habit", "motiondreambig", "doomscrolling break", 107900, 4180),
    ("F08", "my skin on high cortisol vs my skin now", "before / now", "elizabethashlen", "never going back to my 20's face", 3600000, 2884),
    ("F08", "coffee on an empty stomach vs matcha after breakfast", "versus swap", "whatieatinaday604", "matcha instead of coffee", 67800, 1964),
    ("F08", "the silent cortisol spikers vs the calming swaps", "two lists", "glowsy.debloat", "the silent face puffer list / the face debloat list", 266200, 3061),
    ("F08", "burnt out me vs healing me", "versus self", "emily.mentalhealth", "how i rebuilt my brain after complete burnout", 125100, 3562),
    ("F08", "my period week before cycle syncing vs after", "before / after", "thatgirlstore.com", "cycle sync", 792, 26),
    ("F08", "your glow up before 2026 ends, cortisol edition", "deadline grid", "fallwithem", "your glow up before 2026 ends", 1200000, 78367),
]

FORMAT_IDS = {
    "F01": "F01_LIFESTYLE_GUIDE", "F03": "F03_ROUTINE_TIMELINE", "F04": "F04_AESTHETIC_EDUCATIONAL",
    "F05": "F05_INTERACTIVE_CHECKLIST", "F07": "F07_RANKING", "F08": "F08_2X2",
}


def main():
    csv_path = ROOT / "docs/research/06_HOOKS_STYLE_REFERENCES_2026-10-11.csv"
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["hook_id", "hook_family", "formula", "emotion", "intensity", "compatible_formats", "compatible_pillars", "persona_fit", "weight", "cooldown_days", "use_count", "last_used_at", "active", "runtime_use", "source", "source_views", "source_saves"])
        for index, (fmt, hook, shape, handle_name, _source_hook, views, saves) in enumerate(HOOKS, 1):
            writer.writerow([f"TT_{fmt}_{index:03d}", shape, hook, "", "", FORMAT_IDS[fmt], "all", "ALL", 1, 7, 0, "", "TRUE", "STYLE_REFERENCE", f"@{handle_name}", views, saves])
    print(csv_path, len(HOOKS))


if __name__ == "__main__":
    main()
