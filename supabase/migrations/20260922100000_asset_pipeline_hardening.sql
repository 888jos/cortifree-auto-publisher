-- Asset pipeline hardening: canonical metadata repair, scene coverage, and selector observability.
alter table if exists assets add column if not exists scene text not null default '';
alter table if exists assets add column if not exists good_for jsonb not null default '[]'::jsonb;
alter table if exists assets add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists persona_scene_templates add column if not exists pillar_affinities jsonb not null default '[]'::jsonb;

create index if not exists assets_scene_search_idx on assets(workspace_id, enabled, source_type, scene);
create index if not exists assets_good_for_search_idx on assets using gin(good_for);

insert into persona_scene_templates
  (id, workspace_id, category, scene_description, recommended_reference_categories, recommended_framing, recommended_outfit, pillar_affinities, enabled)
values
  ('DOOMSCROLLING_IN_BED', 'cortifree', 'night', 'Person lying in bed at night with a phone in hand, visibly caught in a doomscrolling loop; realistic, not dramatic.', '["night_cozy","bedroom"]', 'medium', 'soft pajamas', '["stress_reset","sleep","night_routine"]', true),
  ('OVERSTIMULATED_ON_COUCH', 'cortifree', 'stress_reset', 'Person sitting on a couch after a long day, phone nearby, shoulders slightly tense, quiet lived-in room.', '["home_reset","night_cozy"]', 'medium', 'comfortable homewear', '["stress_reset","self_care"]', true),
  ('PHONE_FACE_DOWN_RESET', 'cortifree', 'stress_reset', 'Person placing a phone face down on a table before taking a breath or starting a calmer activity.', '["home_reset","work_study"]', 'close_up', 'casual homewear', '["stress_reset","focus"]', true),
  ('AFTER_WORK_TRANSITION', 'cortifree', 'stress_reset', 'Person arriving home and changing out of work clothes, creating a clear transition between work and evening.', '["home_reset","getting_ready"]', 'wide', 'casual basics', '["stress_reset","routine"]', true),
  ('STUDY_BREAK', 'cortifree', 'work_study', 'Person taking a short break from a study desk: standing, stretching, or looking out a window.', '["work_study","morning_home"]', 'medium', 'casual neutral', '["work_study","stress_reset"]', true),
  ('LATE_NIGHT_LAPTOP', 'cortifree', 'night', 'Person closing a laptop late at night in a softly lit bedroom or home office.', '["night_cozy","work_study"]', 'medium', 'soft layers', '["sleep","work_study","stress_reset"]', true),
  ('SHOWER_WINDDOWN', 'cortifree', 'self_care', 'Person preparing a simple shower wind-down with towel and clean clothes nearby; no spa, sauna, or empty bathroom shot.', '["self_care","bathroom"]', 'medium', 'robe or loungewear', '["self_care","night_routine"]', true),
  ('READING_IN_BED', 'cortifree', 'night', 'Person reading a real book in bed with warm practical light and natural, relaxed posture.', '["night_cozy","bedroom"]', 'medium', 'soft pajamas', '["sleep","night_routine","stress_reset"]', true),
  ('MORNING_PHONE_FREE', 'cortifree', 'morning', 'Person opening curtains or making a drink before reaching for their phone.', '["morning_home","kitchen"]', 'medium', 'soft homewear', '["morning_routine","stress_reset"]', true),
  ('JOURNAL_PLANNING', 'cortifree', 'work_study', 'Person writing one concrete next step in a notebook beside a laptop or coffee.', '["work_study","morning_home"]', 'overhead', 'casual neutral', '["planning","work_study","stress_reset"]', true),
  ('HYDRATION_BREAK', 'cortifree', 'self_care', 'Person taking a genuine water break at home, at a desk, or after movement.', '["self_care","fitness_pilates"]', 'medium', 'casual basics', '["self_care","fitness"]', true),
  ('EASY_SNACK', 'cortifree', 'food', 'Person preparing a simple snack in a real kitchen, with natural portions and no wellness claims.', '["food_grocery","kitchen"]', 'medium', 'casual homewear', '["food","self_care"]', true),
  ('MEAL_PREP', 'cortifree', 'food', 'Person preparing a simple meal in a lived-in kitchen with ingredients and one clear action.', '["food_grocery","kitchen"]', 'wide', 'casual homewear', '["food","routine"]', true),
  ('GYM_MIRROR', 'cortifree', 'fitness', 'Person taking a natural gym mirror photo after a workout; believable gym setting and relaxed expression.', '["fitness_pilates","mirror_selfie"]', 'full_body', 'minimal activewear', '["fitness","movement"]', true),
  ('WALKING_OUTSIDE', 'cortifree', 'outdoors', 'Person walking outside on a quiet street or path, candid and grounded rather than fashion-editorial.', '["outdoors_walk","coffee_cafe"]', 'full_body', 'casual streetwear', '["movement","stress_reset"]', true),
  ('RUNNING', 'cortifree', 'fitness', 'Person on an easy outdoor run with natural form and everyday activewear.', '["outdoors_walk","fitness_pilates"]', 'full_body', 'everyday activewear', '["fitness","movement"]', true),
  ('LAUNDRY_RESET', 'cortifree', 'home', 'Person folding or starting a small laundry reset in a real bedroom or utility space.', '["home_reset","bedroom"]', 'medium', 'comfortable basics', '["routine","stress_reset"]', true),
  ('TIDY_ROOM', 'cortifree', 'home', 'Person tidying one visible surface or making the bed; one small reset, not a staged empty room.', '["home_reset","bedroom"]', 'wide', 'casual homewear', '["routine","stress_reset"]', true),
  ('SUNDAY_RESET', 'cortifree', 'home', 'Person doing a realistic Sunday reset with notebook, laundry, groceries, or room tidying.', '["home_reset","food_grocery","work_study"]', 'wide', 'casual basics', '["routine","planning","stress_reset"]', true),
  ('COMMUTE', 'cortifree', 'outdoors', 'Person taking a calm commute reset on foot or waiting for transit, phone not dominating the frame.', '["outdoors_walk","coffee_cafe"]', 'wide', 'casual streetwear', '["stress_reset","movement"]', true),
  ('COFFEE_SHOP_WORK', 'cortifree', 'work_study', 'Person working briefly in a coffee shop with one laptop, notebook, and a clear focus task.', '["work_study","coffee_cafe"]', 'medium', 'casual neutral', '["work_study","planning"]', true),
  ('SKINCARE_BATHROOM', 'cortifree', 'self_care', 'Person doing a simple skincare step at a bathroom mirror; natural and practical, not a spa scene.', '["self_care"]', 'medium', 'neutral loungewear', '["self_care","night_routine"]', true),
  ('GETTING_READY', 'cortifree', 'self_care', 'Person getting ready in a bedroom or bathroom with one outfit or accessory action visible.', '["getting_ready","self_care"]', 'medium', 'simple everyday outfit', '["glow_up","self_care"]', true),
  ('GROCERY_UNPACK', 'cortifree', 'food', 'Person unpacking a few groceries in a real kitchen, focused on one practical reset.', '["food_grocery","kitchen"]', 'medium', 'casual homewear', '["food","weekly_reset"]', true),
  ('LOW_ENERGY_DAY', 'cortifree', 'stress_reset', 'Person having a low-energy day on a couch or bed with water, blanket, or a simple next step.', '["home_reset","night_cozy"]', 'medium', 'comfortable homewear', '["stress_reset","self_care"]', true),
  ('COZY_RAINY_DAY', 'cortifree', 'home', 'Person by a rainy window with tea, book, or laptop; cozy but natural and not empty-room photography.', '["night_cozy","bedroom","work_study"]', 'medium', 'soft layers', '["stress_reset","self_care"]', true),
  ('WINTER_WALK', 'cortifree', 'outdoors', 'Person walking outdoors in winter layers with natural daylight and a grounded candid feel.', '["outdoors_walk","fall"]', 'full_body', 'cozy winter layers', '["movement","stress_reset"]', true)
on conflict (id) do update set
  category = excluded.category,
  scene_description = excluded.scene_description,
  recommended_reference_categories = excluded.recommended_reference_categories,
  recommended_framing = excluded.recommended_framing,
  recommended_outfit = excluded.recommended_outfit,
  pillar_affinities = excluded.pillar_affinities,
  enabled = excluded.enabled,
  updated_at = now();
