// Subset of CodeIgniter `application/config/constants.php` dropdowns.
// Kept here so React forms can match PHP option lists.

export const INSPECTION_DROPDOWNS = {
  wearing_coat: {
    // PHP: WEARING_COAT_MATERIAL
    material: [
      { value: '', label: 'Select Material' },
      { value: 'Bituminous', label: 'Bituminous' },
      { value: 'Cement Concrete', label: 'Cement Concrete' },
    ],
    // PHP: SURFACE_CONDITION (stored value is code, label is text)
    surface_condition: [
      { value: '', label: 'Select Surface Condition' },
      { value: 'GoodPavement', label: 'Pavement is in Good Condition, No Distress Observed' },
      {
        value: 'MinorFlexible',
        label: 'Minor Flexible Distress Observed: Crack Types/ Ravelling/ Potholes/ Roughness/ Disintegration/ Bleeding',
      },
      {
        value: 'MajorFlexible',
        label: 'Major Flexible Distress Observed: Crack Types/ Ravelling/ Potholes/ Roughness/ Disintegration/ Bleeding',
      },
      {
        value: 'MinorRigid',
        label:
          'Minor Rigid Distress Observed: Crack Types/ Corner Breaks/ Punchout/ Popouts/ Roughness/ Disintegration/ Loss of Surface Texture',
      },
      {
        value: 'MajorRigid',
        label:
          'Major Rigid Distress Observed: Crack Types/ Corner Breaks/ Punchout/ Popouts/ Roughness/ Disintegration/ Loss of Surface Texture',
      },
    ],
  },

  drainage_spouts_and_vest_holes: {
    // PHP: CLOGGING_DETERIORATION_LHS / RHS
    check_clogging_lhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Driange spouts is clogged', label: 'Driange spouts is clogged' },
      { value: 'No drainage spouts clogged', label: 'No drainage spouts clogged' },
    ],
    check_clogging_rhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Driange spouts is clogged', label: 'Driange spouts is clogged' },
      { value: 'No drainage spouts clogged', label: 'No drainage spouts clogged' },
    ],
    // PHP: PROJECTION_OF_SPOUT_LHS / RHS
    check_projection_of_spout_lhs: [
      { value: 'NA', label: 'NA' },
      { value: 'No structural member is affected', label: 'No structural member is affected' },
      { value: 'No drainage spouts are clogged', label: 'No drainage spouts are clogged' },
      {
        value: 'Structural member being affected on the underside due to inadequate projection',
        label: 'Structural member being affected on the underside due to inadequate projection',
      },
      { value: 'Projection to be provide', label: 'Projection to be provide' },
    ],
    check_projection_of_spout_rhs: [
      { value: 'NA', label: 'NA' },
      { value: 'No structural member is affected', label: 'No structural member is affected' },
      { value: 'No drainage spouts are clogged', label: 'No drainage spouts are clogged' },
      {
        value: 'Structural member being affected on the underside due to inadequate projection',
        label: 'Structural member being affected on the underside due to inadequate projection',
      },
      { value: 'Projection to be provide', label: 'Projection to be provide' },
    ],
    // PHP: ADEQUACY_THEROF_LHS / RHS
    check_adequacy_thereof_lhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Adequate', label: 'Adequate' },
      { value: 'In- adequate', label: 'In- adequate' },
    ],
    check_adequacy_thereof_rhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Adequate', label: 'Adequate' },
      { value: 'In- adequate', label: 'In- adequate' },
    ],
    // PHP: REPORT_ABOUT_ADEQUACY_LHS / RHS
    for_subway_reports_lhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Not applicable because structure is not subway', label: 'Not applicable because structure is not subway' },
      { value: 'Adeqaute Drainage and pumping arrangement are found', label: 'Adeqaute Drainage and pumping arrangement are found' },
    ],
    for_subway_reports_rhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Not applicable because structure is not subway', label: 'Not applicable because structure is not subway' },
      { value: 'Adeqaute Drainage and pumping arrangement are found', label: 'Adeqaute Drainage and pumping arrangement are found' },
    ],
    report_absence_of_drainage_spouts_lhs: [
      { value: 'NA', label: 'NA' },
      { value: 'There is no absence of drainage spouts', label: 'There is no absence of drainage spouts' },
      { value: 'Absence of drainage spouts are observed', label: 'Absence of drainage spouts are observed' },
      { value: 'Others', label: 'Others' },
    ],
    report_absence_of_drainage_spouts_rhs: [
      { value: 'NA', label: 'NA' },
      { value: 'There is no absence of drainage spouts', label: 'There is no absence of drainage spouts' },
      { value: 'Absence of drainage spouts are observed', label: 'Absence of drainage spouts are observed' },
      { value: 'Others', label: 'Others' },
    ],
    check_choking_of_drainage_holes_lhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Drainage spouts choked in the bottom booms', label: 'Drainage spouts choked in the bottom booms' },
      { value: 'No drainage holes choked in the bottom booms', label: 'No drainage holes choked in the bottom booms' },
      { value: 'Others', label: 'Others' },
    ],
    check_choking_of_drainage_holes_rhs: [
      { value: 'NA', label: 'NA' },
      { value: 'Drainage spouts choked in the bottom booms', label: 'Drainage spouts choked in the bottom booms' },
      { value: 'No drainage holes choked in the bottom booms', label: 'No drainage holes choked in the bottom booms' },
      { value: 'Others', label: 'Others' },
    ],
  },

  handrails: {
    present_lhs: ['Yes', 'No'].map((v) => ({ value: v, label: v })),
    present_rhs: ['Yes', 'No'].map((v) => ({ value: v, label: v })),
    material_lhs: ['', 'RCC', 'Steel', 'Timber', 'Masonary'].map((v) => ({
      value: v,
      label: v === '' ? 'Select Material' : v,
    })),
    material_rhs: ['', 'RCC', 'Steel', 'Timber', 'Masonary'].map((v) => ({
      value: v,
      label: v === '' ? 'Select Material' : v,
    })),
    conditions_lhs: [
      '',
      'Hand Rail , parapets and Crash barriers is in Good Condition',
      'Hand Rail , parapets and Crash barriers is Not in good Condition',
      'Hand Rail , parapets and Crash barriers is not present',
    ].map((v) => ({ value: v, label: v === '' ? 'Select Condition' : v })),
    conditions_rhs: [
      '',
      'Hand Rail , parapets and Crash barriers is in Good Condition',
      'Hand Rail , parapets and Crash barriers is Not in good Condition',
      'Hand Rail , parapets and Crash barriers is not present',
    ].map((v) => ({ value: v, label: v === '' ? 'Select Condition' : v })),
    expansion_joint_gap_lhs: [
      '',
      'Expansion joint gaps observed',
      'No expansion joint gaps found',
    ].map((v) => ({ value: v, label: v === '' ? 'Select Expansion Joint Gap' : v })),
    expansion_joint_gap_rhs: [
      '',
      'Expansion joint gaps observed',
      'No expansion joint gaps found',
    ].map((v) => ({ value: v, label: v === '' ? 'Select Expansion Joint Gap' : v })),
    inspection_galley_ladder_platform_lhs: ['', 'MBIU', 'Ladder', 'Man Lift', 'Other'].map((v) => ({
      value: v,
      label: v === '' ? 'Select Gallery Ladder Platform' : v,
    })),
    inspection_galley_ladder_platform_rhs: ['', 'MBIU', 'Ladder', 'Man Lift', 'Other'].map((v) => ({
      value: v,
      label: v === '' ? 'Select Gallery Ladder Platform' : v,
    })),
  },

  footpaths: {
    present_lhs: ['Yes', 'No', 'NA'].map((v) => ({ value: v, label: v })),
    present_rhs: ['Yes', 'No', 'NA'].map((v) => ({ value: v, label: v })),
    material_lhs: ['', 'NA', 'Concrete', 'Masonary', 'Timber', 'Others'].map((v) => ({
      value: v,
      label: v === '' ? 'select material' : v,
    })),
    material_rhs: ['', 'NA', 'Concrete', 'Masonary', 'Timber', 'Others'].map((v) => ({
      value: v,
      label: v === '' ? 'select material' : v,
    })),
    conditions_lhs: [
      '',
      'NA',
      'Footpath observed to be in good condition',
      'Footpath is not in good condition',
      'Others',
    ].map((v) => ({ value: v, label: v === '' ? 'select condition' : v })),
    conditions_rhs: [
      '',
      'NA',
      'Footpath observed to be in good condition',
      'Footpath is not in good condition',
      'Others',
    ].map((v) => ({ value: v, label: v === '' ? 'select condition' : v })),
  },

  utilities: {
    present_lhs: ['Yes', 'No', 'NA'].map((v) => ({ value: v, label: v })),
    present_rhs: ['Yes', 'No', 'NA'].map((v) => ({ value: v, label: v })),
    type_of_utility_lhs: [
      '',
      'Drainage Pipe lines',
      'Electrical Lines',
      'Telephonic lines',
      'Gas Pipe Lines',
      'Lighting Facilities',
      'Water Pipe Lines',
      'Others',
      'No utilities Found',
    ].map((v) => ({ value: v, label: v === '' ? 'Select Utility Type' : v })),
    type_of_utility_rhs: [
      '',
      'Drainage Pipe lines',
      'Electrical Lines',
      'Telephonic lines',
      'Gas Pipe Lines',
      'Lighting Facilities',
      'Water Pipe Lines',
      'Others',
      'No utilities Found',
    ].map((v) => ({ value: v, label: v === '' ? 'Select Utility Type' : v })),
    any_type_of_encroachment_lhs: ['', 'Yes', 'No', 'Other'].map((v) => ({
      value: v,
      label: v === '' ? 'Select Encroachment Under The Bridge' : v,
    })),
    any_type_of_encroachment_rhs: ['', 'Yes', 'No', 'Other'].map((v) => ({
      value: v,
      label: v === '' ? 'Select Encroachment Under The Bridge' : v,
    })),
    report_damage_due_to_utility_lhs: [
      '',
      'Physical Damage',
      'Corrosion',
      'Material Degradation',
      'Ground Movement',
      'Animal Infestation',
      'Cracking',
      'Spalling',
      'Settlement',
      'Displacement',
      'Inadequate Drainage',
      'Damage to Frames and Covers',
      'Oxidation',
      'Piping Damage',
      'Cable Damage',
      'Conduit Damage',
      'Joint Failures etc',
    ].map((v) => ({ value: v, label: v === '' ? 'Select' : v })),
    report_damage_due_to_utility_rhs: [
      '',
      'Physical Damage',
      'Corrosion',
      'Material Degradation',
      'Ground Movement',
      'Animal Infestation',
      'Cracking',
      'Spalling',
      'Settlement',
      'Displacement',
      'Inadequate Drainage',
      'Damage to Frames and Covers',
      'Oxidation',
      'Piping Damage',
      'Cable Damage',
      'Conduit Damage',
      'Joint Failures etc',
    ].map((v) => ({ value: v, label: v === '' ? 'Select' : v })),
  },

  // Protection Works (PHP: TYPE, SLOPE_PITICHING_APRON_ANDTOE_WALLS, FLOOR_PROTECTION_WORKS, SCOUR_FOR_ABUTMENTS, SCOUR_FOR_PIERS, RESERVE_STORE_MATERIAL)
  protection_works: {
    type: [
      { value: '', label: 'Select Type' },
      { value: 'Around Abutments protected with riprap', label: 'Around Abutments protected with riprap' },
      {
        value: 'Around abutments protected with cement concrete',
        label: 'Around abutments protected with cement concrete',
      },
      { value: 'No protection provided around abutments', label: 'No protection provided around abutments' },
      { value: 'Others', label: 'Not Applicable' },
    ],
    slope_pitching_apron_and_toe_walls: [
      { value: '', label: 'Select Slope' },
      { value: 'damage Found in slope pitching/apron/toe walls', label: 'damage Found in slope pitching/apron/toe walls' },
      { value: 'damage not Found in slope pitching/apron/toe walls', label: 'damage not Found in slope pitching/apron/toe walls' },
      { value: 'Not Applicable', label: 'Not Applicable' },
    ],
    floor_protection_works: [
      { value: '', label: 'Select Floor Protection Work' },
      { value: 'Damage Found in floor Protection works', label: 'Damage Found in floor Protection works' },
      { value: 'Damage not Found in floor Protection works', label: 'Damage not Found in floor Protection works' },
      { value: 'Not Applicable', label: 'Not Applicable' },
    ],
    scour_for_abutments: [
      { value: '', label: 'Select Scour For Abutments' },
      { value: 'Scour observed at Abutments', label: 'Scour observed at Abutments' },
      { value: 'Scour not observed at Abutments', label: 'Scour not observed at Abutments' },
      { value: 'Not Applicable', label: 'Not Applicable' },
    ],
    scour_for_piers: [
      { value: '', label: 'Select Scour For Piers' },
      { value: 'Scour observed at Piers', label: 'Scour observed at Piers' },
      { value: 'Scour not observed at Piers', label: 'Scour not observed at Piers' },
      { value: 'Not Applicable', label: 'Not Applicable' },
    ],
    reserve_store_material: [
      { value: '', label: 'Select Reserve Stone Material' },
      { value: 'Yes, Reserve store material is Present/Available', label: 'Yes, Reserve store material is Present/Available' },
      { value: 'No, Reserve store material is not Present/Available', label: 'No, Reserve store material is not Present/Available' },
    ],
  },

  // Waterway (PHP: CHECK_PRESENCE_OF_OBSTRUCTION, FLOW_PATTERN)
  waterway: {
    check_presence_of_obstruction: [
      { value: '', label: 'Select Presence Of Obstruction' },
      {
        value: 'Yes, Obstruction in flow and its impact on flow, Island formation, Vegetation growth is observed',
        label: 'Yes, Obstruction in flow and its impact on flow, Island formation, Vegetation growth is observed',
      },
      {
        value: 'No, Obstruction in flow and its impact on flow, Island formation, Vegetation growth is observed',
        label: 'No, Obstruction in flow and its impact on flow, Island formation, Vegetation growth is observed',
      },
      { value: 'Not Applicable', label: 'Not Applicable' },
    ],
    flow_pattern: [
      { value: '', label: 'Select Flow Pattern' },
      { value: 'Flow Pattern is Normal', label: 'Flow Pattern is Normal' },
      { value: 'Flow Pattern is abnormal', label: 'Flow Pattern is abnormal' },
      { value: 'Not Applicable', label: 'Not Applicable' },
    ],
  },

  // Foundation (PHP: TYPE_BRIDGE, FOUNDATION_MATERIAL, CONDITION_OF_FOUNDATION, FLOATING_BODIES)
  foundation: {
    foundation_type: [
      { value: '', label: 'Select Type' },
      { value: 'Well Foundation', label: 'Well Foundation' },
      { value: 'Open Foundation', label: 'Open Foundation' },
      { value: 'Pile Foundation', label: 'Pile Foundation' },
      { value: 'Raft Foundation', label: 'Raft Foundation' },
      { value: 'Spread Foundation', label: 'Spread Foundation' },
      { value: 'Isolated Foundation', label: 'Isolated Foundation' },
      {
        value: 'Foundation is not visible, Data to be referred from design document/as-built drawing',
        label: 'Foundation is not visible, Data to be referred from design document/as-built drawing',
      },
    ],
    material: [
      { value: '', label: 'Select Material' },
      { value: 'Brick', label: 'Brick' },
      { value: 'RCC', label: 'RCC' },
      {
        value: 'Foundation is not visible, Data to be referred from design document/as-built drawing',
        label: 'Foundation is not visible, Data to be referred from design document/as-built drawing',
      },
    ],
    condition_of_foundation: [
      { value: '', label: 'Select Condition Of Foundation' },
      { value: 'Settlement Observed', label: 'Settlement Observed' },
      { value: 'Abnormal Scour Observed', label: 'Abnormal Scour Observed' },
      { value: 'Tilting Observed', label: 'Tilting Observed' },
      { value: 'Good in Condition', label: 'Good in Condition' },
      { value: 'Foundation Not Visible', label: 'Foundation Not Visible' },
    ],
    floating_bodies_boulders: [
      { value: 'NA', label: 'NA' },
      { value: 'No damage Observed', label: 'No damage Observed' },
      { value: 'Damage Observed', label: 'Damage Observed' },
    ],
  },

  // Substructure (PHP: TYPE_A1/A2, MATERIAL_A1/A2, CONDITION_A1/A2, EFFICIENCY_OF_DRAINAGE_A1/A2, PIER_CONDITION)
  substructure: {
    type_a1: [
      'NA',
      'Solid masonry wall type',
      'Solid RCC wall type',
      'Circular pier with Hammer Head',
      'Square pier with Hammer Head',
      'Rectangular pier with Hammer Head',
      'Rigid frame or portal pier',
      'Trestle Pier or Trestle Bent',
    ].map((v) => ({ value: v, label: v })),
    type_a2: [
      'NA',
      'Solid masonry wall type',
      'Solid RCC wall type',
      'Circular pier with Hammer Head',
      'Square pier with Hammer Head',
      'Rectangular pier with Hammer Head',
      'Rigid frame or portal pier',
      'Trestle Pier or Trestle Bent',
    ].map((v) => ({ value: v, label: v })),
    substructure_material_a1: [
      'NA',
      'Brick Stone Masonry',
      'CRS Stone Masonry',
      'Stone Masonry',
      'Reinforced cement concrete',
      'Masonry',
      'Other',
    ].map((v) => ({ value: v, label: v })),
    substructure_material_a2: [
      'NA',
      'Brick Stone Masonry',
      'CRS Stone Masonry',
      'Stone Masonry',
      'Reinforced cement concrete',
      'Masonry',
      'Other',
    ].map((v) => ({ value: v, label: v })),
    condition_a1: [
      { value: 'NA', label: 'NA' },
      { value: 'Abutment is in good condition', label: 'Abutment is in good condition' },
      {
        value: 'Abutment is not in good condition enter observed distress',
        label: 'Abutment is not in good condition enter observed distress',
      },
    ],
    condition_a2: [
      { value: 'NA', label: 'NA' },
      { value: 'Abutment is in good condition', label: 'Abutment is in good condition' },
      {
        value: 'Abutment is not in good condition enter observed distress',
        label: 'Abutment is not in good condition enter observed distress',
      },
    ],
    efficiency_drainage_a1: [
      'NA',
      'Weep holes functioning good and no evidence of moisture on abutment faces',
      'Weep holes are not functioning good and there is an evidence of moisture on abutment faces is observed',
      'weep holes functioning good and shows the evidence of moisture',
      'Weep holes are not functioning good and there is no evidence of moisture on abutment faces is observed',
    ].map((v) => ({ value: v, label: v })),
    efficiency_drainage_a2: [
      'NA',
      'Weep holes functioning good and no evidence of moisture on abutment faces',
      'Weep holes are not functioning good and there is an evidence of moisture on abutment faces is observed',
      'weep holes functioning good and shows the evidence of moisture',
      'Weep holes are not functioning good and there is no evidence of moisture on abutment faces is observed',
    ].map((v) => ({ value: v, label: v })),
  },

  // Bearing & Pedestal (PHP: TYPE_AND_ALLOWABLE_MOVEMENTS_BEARING/PEDESTAL, MATERIAL_BEARING/PEDESTAL,
  // GENERAL_CONDITION_BEARING/PEDESTAL, FUNCTIONING_BEARING/PEDESTAL)
  bearing_and_pedestal: {
    bearing_type_allowable_movements: [
      'NA',
      'No bearing is presented',
      'Elastomeric Bearing',
      'Pot Bearing',
      'Single roller bearing',
      'Multi roller bearing',
      'Rocker Bearing',
      'Disk Bearing',
      'Spherical Bearing',
      'Pin Bearing',
      'Knuckle Pin Bearing',
    ].map((v) => ({ value: v, label: v })),
    pedestal_type_allowable_movements: [
      'NA',
      'No pedestal is presented',
      'Rectangular reinforced cement concrete',
      'Rectangular steel',
      'Rectangular masonry',
    ].map((v) => ({ value: v, label: v })),
    bearing_material: ['NA', 'No bearing is presented', 'Elastomeric', 'Polytetrafluoroet hylene', 'Steel'].map((v) => ({
      value: v,
      label: v,
    })),
    pedestal_material: [
      'NA',
      'No pedestal is presented',
      'Reinforced cement concrete',
      'Steel',
      'Masonry',
    ].map((v) => ({ value: v, label: v })),
    bearing_general_condition: ['NA', 'Rusting', 'Cleanliness', 'Seizing of plates silting', 'Accumulations of dirt'].map((v) => ({
      value: v,
      label: v,
    })),
    pedestal_general_condition: ['NA', 'Rusting', 'Cleanliness', 'Seizing of plates silting', 'Accumulations of dirt'].map((v) => ({
      value: v,
      label: v,
    })),
    bearing_functioning: [
      'NA',
      'No Bearing is Presented',
      'Excessive movement',
      'Tilting',
      'Jumping off guides',
    ].map((v) => ({ value: v, label: v })),
    pedestal_functioning: [
      'NA',
      'No pedestal is Presented',
      'Excessive movement',
      'Tilting',
      'Jumping off guides',
    ].map((v) => ({ value: v, label: v })),
  },

  // Superstructure (PHP: TYPE_OF_SPAN, STRUCTURAL_SYSTEM, TYPE_OF_MATERIAL + bridge_dropdowns)
  superstructure: {
    type_of_span: ['T-Beam', 'I-Girder', 'Slab', 'Box – Girder', 'Arche'].map((v) => ({ value: v, label: v })),
    structural_system: ['Simply Supported', 'Continuous', 'Over Hanging', 'Balance Cantilever'].map((v) => ({
      value: v,
      label: v,
    })),
  },

  // Expansion Joint (PHP: EXPANSION_TYPE_A1/A2, EXPANSION_CONDITION_A1/A2, FUNCTIONING_A1/A2, SEALING_MATERIAL_A1/A2,
  // CHECK_SECURENESS_OF_THE_JOINTS_A1/A2, TOP_SLIDING_PLATE_A1/A2, LOCKING_OF_JOINTS_A1/A2, DERBIS_IN_JOINTS_A1/A2,
  // REPORT_RATTLING_A1/A2, DRAINAGE_FROM_EXPANSION_JOINT_A1/A2, ALIGNMENT_AND_CLEARANCE_A1/A2)
  expansion_joint: {
    type_a1: [
      'NA',
      'Buried joint',
      'Filler joint',
      'Asphaltic plug joint',
      'Compression seal joint',
      'Single strip/box seal joint',
      'Reinforced elastomeric joints',
      'Modular strip/box seal joint',
      'Finger joints',
      'Reinforced coupled elastomeric joint',
    ].map((v) => ({ value: v, label: v })),
    type_a2: [
      'NA',
      'Buried joint',
      'Filler joint',
      'Asphaltic plug joint',
      'Compression seal joint',
      'Single strip/box seal joint',
      'Reinforced elastomeric joints',
      'Modular strip/box seal joint',
      'Finger joints',
      'Reinforced coupled elastomeric joint',
    ].map((v) => ({ value: v, label: v })),
    condition_a1: [
      'NA',
      'Misalignment of joint , debris, Accumulation of soil/ dirt are observed',
      'Misalignment of joint is observed',
      'debris is observed',
      'Accumulation of soil/ dirt is observed',
      'Expansion joint is buried with bituminous layer',
    ].map((v) => ({ value: v, label: v })),
    condition_a2: [
      'NA',
      'Misalignment of joint , debris, Accumulation of soil/ dirt are observed',
      'Misalignment of joint is observed',
      'debris is observed',
      'Accumulation of soil/ dirt is observed',
      'Expansion joint is buried with bituminous layer',
    ].map((v) => ({ value: v, label: v })),
    functioning_a1: ['NA', 'Good in condition', 'Type of distress observed', 'Not Applicable'].map((v) => ({
      value: v,
      label: v,
    })),
    functioning_a2: ['NA', 'Good in condition', 'Type of distress observed', 'Not Applicable'].map((v) => ({
      value: v,
      label: v,
    })),
  },
}

