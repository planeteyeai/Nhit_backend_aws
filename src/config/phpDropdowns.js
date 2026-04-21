/**
 * Inspection component dropdown data for /inspection/component-dropdowns/:key
 * Self-contained — no frontend imports needed.
 * Values mirror PHP constants.php.
 */

const o = (v, l) => ({ value: v, label: l ?? v })
const s = (...vals) => vals.map((v) => o(v, v))

const NA = [o('NA', 'NA')]
const sel = (label, ...vals) => [o('', label), ...s(...vals)]

export const INSPECTION_DROPDOWNS = {
  // ── SUPERSTRUCTURE ─────────────────────────────────────────────────────────
  superstructure: {
    type_of_span: sel('Select Span', 'T - Beam', 'I - Girder', 'Slab', 'Box – Girder', 'Arche'),
    structural_system: sel('Select Structural System', 'Simply Supported', 'Continuous', 'Over Hanging', 'Balance Cantilever'),
    type_of_material: sel('Select Type Of Material', 'RCC', 'PSC', 'Steel', 'Timber', 'Masonry', 'Brick Stone Masonry', 'CRS Stone Masonry', 'Stone Masonry'),
    check_spalling_disintegration_or_honey_combing: sel('Select', 'Yes, Location: Girder, Deck, Pedestal etc.', 'No distress, Good in condition', 'No special attention required to take at bearing point'),
    check_cracks: sel('Select Cracks', 'Yes, Location: Girder, Deck, Pedestal etc.', 'No Cracks Noticed'),
    check_exposed_reinforcement: sel('Select', 'Yes, Location: Girder, Deck, Pedestal etc.', 'No distress, Good in condition'),
    check_wear_of_deck_surface: sel('Select', 'Yes, Location: Girder, Deck, Pedestal etc.', 'No distress, Good in condition', 'Other'),
    check_scaling: sel('Select Scaling', 'Yes, Location: Girder, Deck, Pedestal etc.', 'No distress, Good in condition', 'Other'),
    check_surface_stains_and_rust_stains: sel('Select', 'Yes, Location: Girder, Deck, Pedestal etc.', 'No distress, Good in condition'),
    check_leaching: sel('Select Leaching', 'Yes, Leaching Is observed, Location', 'No Leaching Observed'),
    check_corrosion_of_reinforcements: sel('Select', 'Corrosion of reinforcement is observed in sheathing and tendon', 'Sheathing and tendon is not visible', 'Not Applicable'),
    check_leakage: sel('Select Leakage', 'Leakage through Concrete Decks', 'Leakage through Construction joint', 'Leakage through Kerbs', 'Leakage through Deck', 'No leakage of water is observed'),
    check_damages_due_to_moving_vehicles: sel('Select', 'Yes, Location and type of damage', 'No damages observed due to moving vehicles'),
    check_condition_of_articulation: sel('Select', 'No cracks and exposed reinforcement is observed', 'Cracks and Exposed reinforcement is observed'),
    check_excessive_vibrations: sel('Select Excessive Vibrations', 'Yes', 'No'),
    check_excessive_deflections_loss_of_camber: sel('Select', 'Yes', 'No'),
    check_cracks_around_anchorage_zone: sel('Select', 'Not applicable; Hence it is not prestressed concrete', 'No cracks observed around anchorage zone', 'Cracks observed around anchorage zone'),
    check_excessive_deflections_at_central_hinge: sel('Select', 'Not applicable because it is not a cantilever bridge', 'Observed excessive deflection at central hinge', 'No excessive deflection is observed'),
    in_box_girders: sel('Select Box Girders', 'Not applicable because it is not a box girder', 'No sign of cracks and accumulation of water or debris', 'Cracks and accumulation of water or debris is observed'),
    check_accumulation_of_slit: sel('Select', 'Not applicable because it is not a submersible bridge', 'Others'),
    check_peeling_off: sel('Select Peeling Off', 'Protective coat is in good condition', 'Observed peeling off of protective coat', 'Others'),
    check_steel_members: sel('Select Steel Members', 'Others', 'Not Applicable'),
    check_condition_of_protective_system: sel('Select', 'Girder', 'Beam', 'Bearing Area', 'Others', 'Not Applicable'),
    check_corrosion_if_any: sel('Select', 'Girder', 'Beam', 'Deck', 'Bearing Area', 'Others', 'Not Applicable'),
    check_excessive_vibrations_if_any: sel('Select', 'Girder', 'Beam', 'Deck', 'Bearing Area', 'Others', 'Not Applicable'),
    check_alignment_of_members: sel('Select', 'Properly Aligned', 'Not Aligned', 'Not Applicable', 'Others'),
    check_excessive_loss_of_camber_and_excessive_deflection: sel('Select', 'Not applicable', 'Found excessive loss of camber and deformations', 'Others'),
    check_apparent_fracture: sel('Select Apparent Fracture', 'Not applicable', 'No apparent fracture is identified', 'Others'),
    masonry_arches: sel('Select Masonry Arches', 'Others', 'Not Applicable'),
    masonry_joints: sel('Select Masonry Joints', 'Not applicable because it is not a masonry bridge', 'Condition of joints mortar, painting and masonry is in good condition', 'Others'),
    arch_profile: sel('Select Arch Profile', 'Not applicable bridge', 'Profile is in good condition', 'Others'),
    arch_cracks: sel('Select Arch Cracks', 'Arch', 'Slab', 'Not Applicable', 'Others'),
    spandrel_drainage: sel('Select Spandrel Drainage', 'Not applicable', 'Spandrel wall is in good condition', 'Others'),
    vegetation_growth: sel('Select Vegetation Growth', 'Vegetation Growth Visible', 'Not Applicable', 'Vegetation Growth Not Visible', 'Not Observed', 'Others'),
    iron_components: sel('Select Iron Components', 'Not applicable', 'Steel superstructure is in good condition', 'Steel superstructure rivets and bolts are loose', 'Others'),
    steel_bridge_condition: sel('Select Steel Bridge', 'Others', 'Not applicable'),
    masonry_bridge_condition: sel('Select Masonry Bridge', 'Others', 'Not Applicable'),
    vegetation_present: sel('Select Vegetation Present', 'No vegetation is observed', 'Vegetation is observed'),
  },

  // ── EXPANSION JOINT ────────────────────────────────────────────────────────
  expansion_joint: {
    expansion_type_a1: [...NA, ...s('Buried joint', 'Filler joint', 'Asphaltic plug joint', 'Compression seal joint', 'Single strip/box seal joint', 'Reinforced elastomeric joints', 'Modular strip/box seal joint', 'Finger joints', 'Reinforced coupled elastomeric joint')],
    expansion_type_a2: [...NA, ...s('Buried joint', 'Filler joint', 'Asphaltic plug joint', 'Compression seal joint', 'Single strip/box seal joint', 'Reinforced elastomeric joints', 'Modular strip/box seal joint', 'Finger joints', 'Reinforced coupled elastomeric joint')],
    expansion_condition_a1: [...NA, ...s('Misalignment of joint , debris, Accumulation of soil/ dirt are observed', 'Misalignment of joint is observed', 'debris is observed', 'Accumulation of soil/ dirt is observed', 'Expansion joint is buried with bituminous layer')],
    expansion_condition_a2: [...NA, ...s('Misalignment of joint , debris, Accumulation of soil/ dirt are observed', 'Misalignment of joint is observed', 'debris is observed', 'Accumulation of soil/ dirt is observed', 'Expansion joint is buried with bituminous layer')],
    functioning_a1: [...NA, ...s('Good in condition', 'Type of distress observed', 'Not Applicable')],
    functioning_a2: [...NA, ...s('Good in condition', 'Type of distress observed', 'Not Applicable')],
    sealing_material_a1: [...NA, ...s('Good in condition', 'Sealing material damaged', 'Not Applicable')],
    sealing_material_a2: [...NA, ...s('Good in condition', 'Sealing material damaged', 'Not Applicable')],
    check_secureness_of_the_joints_a1: [...NA, ...s('Secured', 'Unsecured', 'Not Visible', 'Not Applicable')],
    check_secureness_of_the_joints_a2: [...NA, ...s('Secured', 'Unsecured', 'Not Visible', 'Not Applicable')],
    top_sliding_plate_a1: [...NA, ...s('Good in condition', 'Type of distress observed', 'Not Visible', 'Not Applicable')],
    top_sliding_plate_a2: [...NA, ...s('Good in condition', 'Type of distress observed', 'Not Visible', 'Not Applicable')],
    locking_of_joints_a1: [...NA, ...s('Interlocked', 'Joint Is improperly locked as Locking Teeth is Damaged', 'Expansion joint is buried with bituminous layer', 'Not Applicable')],
    locking_of_joints_a2: [...NA, ...s('Interlocked', 'Joint Is improperly locked as Locking Teeth is Damaged', 'Expansion joint is buried with bituminous layer', 'Not Applicable')],
    derbis_in_joints_a1: [...NA, ...s('Expansion joint is buried with bituminous layer', 'Debris observed in joints', 'No debris observed in joints')],
    derbis_in_joints_a2: [...NA, ...s('Expansion joint is buried with bituminous layer', 'Debris observed in joints', 'No debris observed in joints')],
    report_rattling_a1: [...NA, ...s('Expansion joint is buried with bituminous layer', 'Rattling is audible', 'Rattling is not audible')],
    report_rattling_a2: [...NA, ...s('Expansion joint is buried with bituminous layer', 'Rattling is audible', 'Rattling is not audible')],
    drainage_from_expansion_joint_a1: [...NA, ...s('Expansion joint is buried with bituminous layer', 'No drainage from expansion joint', 'Drainage from expansion joint is observed')],
    drainage_from_expansion_joint_a2: [...NA, ...s('Expansion joint is buried with bituminous layer', 'No drainage from expansion joint', 'Drainage from expansion joint is observed')],
    alignment_and_clearance_a1: [...NA, ...s('Proper alignment and clearance is Observed/Notice', 'No Proper alignment and clearance is Observed/Noticed', 'Expansion joint is buried with bituminous layer')],
    alignment_and_clearance_a2: [...NA, ...s('Proper alignment and clearance is Observed/Notice', 'No Proper alignment and clearance is Observed/Noticed', 'Expansion joint is buried with bituminous layer')],
  },

  // ── WEARING COAT ───────────────────────────────────────────────────────────
  wearing_coat: {
    wearing_coat_material: sel('Select Material', 'Bituminous', 'Cement Concrete'),
    surface_condition: [
      o('', 'Select Surface Condition'),
      o('GoodPavement', 'Pavement is in Good Condition, No Distress Observed'),
      o('MinorFlexible', 'Minor Flexible Distress Observed: Crack Types/ Ravelling/ Potholes/ Roughness/ Disintegration/ Bleeding'),
      o('MajorFlexible', 'Major Flexible Distress Observed: Crack Types/ Ravelling/ Potholes/ Roughness/ Disintegration/ Bleeding'),
      o('MinorRigid', 'Minor Rigid Distress Observed: Crack Types/ Corner Breaks/ Punchout/ Popouts/ Roughness/ Disintegration/ Loss of Surface Texture'),
      o('MajorRigid', 'Major Rigid Distress Observed: Crack Types/ Corner Breaks/ Punchout/ Popouts/ Roughness/ Disintegration/ Loss of Surface Texture'),
    ],
  },

  // ── DRAINAGE SPOUTS AND VEST HOLES ─────────────────────────────────────────
  drainage_spouts_and_vest_holes: {
    clogging_deterioration_lhs: [...NA, ...s('Driange spouts is clogged', 'No drainage spouts clogged')],
    clogging_deterioration_rhs: [...NA, ...s('Driange spouts is clogged', 'No drainage spouts clogged')],
    projection_of_spout_lhs: [...NA, ...s('No structural member is affected', 'No drainage spouts are clogged', 'Structural member being affected on the underside due to inadequate projection', 'Projection to be provide')],
    projection_of_spout_rhs: [...NA, ...s('No structural member is affected', 'No drainage spouts are clogged', 'Structural member being affected on the underside due to inadequate projection', 'Projection to be provide')],
    adequacy_therof_lhs: [...NA, ...s('Adequate', 'In- adequate')],
    adequacy_therof_rhs: [...NA, ...s('Adequate', 'In- adequate')],
    report_about_adequacy_lhs: [...NA, ...s('Not applicable because structure is not subway', 'Adeqaute Drainage and pumping arrangement are found')],
    report_about_adequacy_rhs: [...NA, ...s('Not applicable because structure is not subway', 'Adeqaute Drainage and pumping arrangement are found')],
    absence_of_drainage_spouts_lhs: [...NA, ...s('There is no absence of drainage spouts', 'Absence of drainage spouts are observed', 'Others')],
    absence_of_drainage_spouts_rhs: [...NA, ...s('There is no absence of drainage spouts', 'Absence of drainage spouts are observed', 'Others')],
    choking_of_drainage_holes_lhs: [...NA, ...s('Drainage spouts choked in the bottom booms', 'No drainage holes choked in the bottom booms', 'Others')],
    choking_of_drainage_holes_rhs: [...NA, ...s('Drainage spouts choked in the bottom booms', 'No drainage holes choked in the bottom booms', 'Others')],
  },

  // ── HANDRAILS, PARAPETS, CRASH BARRIERS ────────────────────────────────────
  handrails: {
    material_lhs: sel('Select Material', 'NA', 'RCC', 'Steel', 'Timber', 'Masonary'),
    material_rhs: sel('Select Material', 'NA', 'RCC', 'Steel', 'Timber', 'Masonary'),
    condition_lhs: sel('Select Condition', 'Hand Rail , parapets and Crash barriers is in Good Condition', 'Hand Rail , parapets and Crash barriers is Not in good Condition', 'Hand Rail , parapets and Crash barriers is not present'),
    condition_rhs: sel('Select Condition', 'Hand Rail , parapets and Crash barriers is in Good Condition', 'Hand Rail , parapets and Crash barriers is Not in good Condition', 'Hand Rail , parapets and Crash barriers is not present'),
    expansion_joint_gap_lhs: sel('Select Expansion Joint Gap', 'Expansion joint gaps observed', 'No expansion joint gaps found'),
    expansion_joint_gap_rhs: sel('Select Expansion Joint Gap', 'Expansion joint gaps observed', 'No expansion joint gaps found'),
    inspection_gallery_ladder_platform_lhs: sel('Select Gallery Ladder Platform', 'MBIU', 'Ladder', 'Man Lift', 'Other'),
    inspection_gallery_ladder_platform_rhs: sel('Select Gallery Ladder Platform', 'MBIU', 'Ladder', 'Man Lift', 'Other'),
  },

  // ── FOOTPATHS ──────────────────────────────────────────────────────────────
  footpaths: {
    footpath_material_lhs: [o('', 'select material'), o('NA', 'NA'), ...s('Concrete', 'Masonary', 'Timber', 'Others')],
    footpath_material_rhs: [o('', 'select material'), o('NA', 'NA'), ...s('Concrete', 'Masonary', 'Timber', 'Others')],
    footpath_condition_lhs: [o('', 'select condition'), o('NA', 'NA'), ...s('Footpath observed to be in good condition', 'Footpath is not in good condition', 'Others')],
    footpath_condition_rhs: [o('', 'select condition'), o('NA', 'NA'), ...s('Footpath observed to be in good condition', 'Footpath is not in good condition', 'Others')],
  },

  // ── UTILITIES ──────────────────────────────────────────────────────────────
  utilities: {
    type_of_utility_lhs: sel('Select Utility Type', 'Drainage Pipe lines', 'Electrical Lines', 'Telephonic lines', 'Gas Pipe Lines', 'Lighting Facilities', 'Water Pipe Lines', 'Others', 'No utilities Found'),
    type_of_utility_rhs: sel('Select Utility Type', 'Drainage Pipe lines', 'Electrical Lines', 'Telephonic lines', 'Gas Pipe Lines', 'Lighting Facilities', 'Water Pipe Lines', 'Others', 'No utilities Found'),
    type_of_encroachment_lhs: sel('Select Encroachment Under The Bridge', 'Yes', 'No', 'Other'),
    type_of_encroachment_rhs: sel('Select Encroachment Under The Bridge', 'Yes', 'No', 'Other'),
  },

  // ── FOUNDATION ─────────────────────────────────────────────────────────────
  foundation: {
    type_bridge: sel('Select Type', 'Well Foundation', 'Open Foundation', 'Pile Foundation', 'Raft Foundation', 'Spread Foundation', 'Isolated Foundation', 'Foundation is not visible, Data to be referred from design document/as-built drawing'),
    foundation_material: sel('Select Material', 'Brick', 'RCC', 'Foundation is not visible, Data to be referred from design document/as-built drawing'),
    condition_of_foundation: sel('Select Condition Of Foundation', 'Settlement Observed', 'Abnormal Scour Observed', 'Tilting Observed', 'Good in Condition', 'Foundation Not Visible'),
    floating_bodies: s('NA', 'No damage Observed', 'Damage Observed'),
  },

  // ── SUBSTRUCTURE ───────────────────────────────────────────────────────────
  substructure: {
    type_a1: s('NA', 'Solid masonry wall type', 'Solid RCC wall type', 'Circular pier with Hammer Head', 'Square pier with Hammer Head', 'Rectangular pier with Hammer Head', 'Rigid frame or portal pier', 'Trestle Pier or Trestle Bent'),
    type_a2: s('NA', 'Solid masonry wall type', 'Solid RCC wall type', 'Circular pier with Hammer Head', 'Square pier with Hammer Head', 'Rectangular pier with Hammer Head', 'Rigid frame or portal pier', 'Trestle Pier or Trestle Bent'),
    material_a1: s('NA', 'Brick Stone Masonry', 'CRS Stone Masonry', 'Stone Masonry', 'Reinforced cement concrete', 'Masonry', 'Other'),
    material_a2: s('NA', 'Brick Stone Masonry', 'CRS Stone Masonry', 'Stone Masonry', 'Reinforced cement concrete', 'Masonry', 'Other'),
    condition_a1: s('NA', 'Abutment is in good condition', 'Abutment is not in good condition enter observed distress'),
    condition_a2: s('NA', 'Abutment is in good condition', 'Abutment is not in good condition enter observed distress'),
    efficiency_of_drainage_a1: s('NA', 'Weep holes functioning good and no evidence of moisture on abutment faces', 'Weep holes are not functioning good and there is an evidence of moisture on abutment faces is observed', 'weep holes functioning good and shows the evidence of moisture', 'Weep holes are not functioning good and there is no evidence of moisture on abutment faces is observed'),
    efficiency_of_drainage_a2: s('NA', 'Weep holes functioning good and no evidence of moisture on abutment faces', 'Weep holes are not functioning good and there is an evidence of moisture on abutment faces is observed', 'weep holes functioning good and shows the evidence of moisture', 'Weep holes are not functioning good and there is no evidence of moisture on abutment faces is observed'),
    pier_condition: sel('Select Pier Condition', 'Pier is in good condition', 'Pier is not in good condition enter observed distress'),
    large_excavations_done: s('Not Applicable', 'Yes, Excavation done in the road below in the vicinity of flyover or road over bridge of viaduct', 'No, Excavation done in the road below in the vicinity of flyover or road over bridge of viaduct'),
    damages_to_protective_measures: s('Not Applicable', 'Yes, damages to protective measures to piers and abutments', 'No, damages to protective measures to piers and abutments'),
    damages_to_protective_coating_or_paint: s('Not Applicable', 'Yes, damages to protective coating or paint', 'No, damages to protective coating or paint'),
  },

  // ── BEARING AND PEDESTAL ───────────────────────────────────────────────────
  bearing_and_pedestal: {
    type_and_allowable_movements_bearing: s('NA', 'No bearing is presented', 'Elastomeric Bearing', 'Pot Bearing', 'Single roller bearing', 'Multi roller bearing', 'Rocker Bearing', 'Disk Bearing', 'Spherical Bearing', 'Pin Bearing', 'Knuckle Pin Bearing'),
    type_and_allowable_movements_pedestal: s('NA', 'No pedestal is presented', 'Rectangular reinforced cement concrete', 'Rectangular steel', 'Rectangular masonry'),
    material_bearing: s('NA', 'No bearing is presented', 'Elastomeric', 'Polytetrafluoroet hylene', 'Steel'),
    material_pedestal: s('NA', 'No pedestal is presented', 'Reinforced cement concrete', 'Steel', 'Masonry'),
    general_condition_bearing: s('NA', 'Rusting', 'Cleanliness', 'Seizing of plates silting', 'Accumulations of dirt'),
    general_condition_pedestal: s('NA', 'Rusting', 'Cleanliness', 'Seizing of plates silting', 'Accumulations of dirt'),
    functioning_bearing: s('NA', 'No Bearing is Presented', 'Excessive movement', 'Tilting', 'Jumping off guides'),
    functioning_pedestal: s('NA', 'No pedestal is Presented', 'Excessive movement', 'Tilting', 'Jumping off guides'),
  },

  // ── WATERWAY ───────────────────────────────────────────────────────────────
  waterway: {
    check_presence_of_obstruction: sel('Select Presence Of Obstruction', 'Yes, Obstruction in flow and its impact on flow, Island formation, Vegetation growth is observed', 'No, Obstruction in flow and its impact on flow, Island formation, Vegetation growth is observed', 'Not Applicable'),
    flow_pattern: sel('Select Flow Pattern', 'Flow Pattern is Normal', 'Flow Pattern is abnormal', 'Not Applicable'),
  },

  // ── PROTECTION WORKS ───────────────────────────────────────────────────────
  protection_works: {
    type: sel('Select Type', 'Around Abutments protected with riprap', 'Around abutments protected with cement concrete', 'No protection provided around abutments', 'Not Applicable'),
    slope_pitiching_apron_andtoe_walls: sel('Select Slope', 'damage Found in slope pitching/apron/toe walls', 'damage not Found in slope pitching/apron/toe walls', 'Not Applicable'),
    floor_protection_works: sel('Select Floor Protection Work', 'Damage Found in floor Protection works', 'Damage not Found in floor Protection works', 'Not Applicable'),
    scour_for_abutments: sel('Select Scour For Abutments', 'Scour observed at Abutments', 'Scour not observed at Abutments', 'Not Applicable'),
    scour_for_piers: sel('Select Scour For Piers', 'Scour observed at Piers', 'Scour not observed at Piers', 'Not Applicable'),
    reserve_store_material: sel('Select Reserve Stone Material', 'Yes, Reserve store material is Present/Available', 'No, Reserve store material is not Present/Available'),
  },
}
