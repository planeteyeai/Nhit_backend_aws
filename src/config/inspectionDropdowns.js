/**
 * Inspection form dropdowns for /inspection/component-dropdowns/:key
 *
 * Source of truth: backend/src/config/constants (inspectionDefines maps + CHECK_* arrays).
 * Column names match DB / InspectionComponentDynamic; values are { value, label }.
 */

import * as C from './constants/inspectionDefines.js'
import { utilitiesDamageType } from './constants/configForms.js'

function opts(arrOrMap) {
  if (arrOrMap == null) return []
  if (Array.isArray(arrOrMap)) {
    return arrOrMap.map((x) => ({
      value: x.value == null ? '' : String(x.value),
      label: x.label == null ? String(x.value ?? '') : String(x.label),
    }))
  }
  if (typeof arrOrMap === 'object') {
    return Object.entries(arrOrMap).map(([value, label]) => ({
      value: value == null ? '' : String(value),
      label: label == null ? String(value ?? '') : String(label),
    }))
  }
  return []
}

function prependSelect(label, constantArr) {
  return opts([{ value: '', label }, ...constantArr])
}

/** @type {Record<string, Record<string, { value: string, label: string }[]>>} */
export const INSPECTION_DROPDOWNS = {
  superstructure: {
    type_of_span: prependSelect('Select Span', C.CHECK_TYPE_OF_SPAN),
    structural_system: prependSelect('Select Structural System', C.CHECK_STRUCTURAL_SYSTEM),
    type_of_material: opts(C.CHECK_TYPE_OF_MATERIAL),
    check_spalling_disintegration_or_honey_combing: opts(C.CHECK_SPALLING_DISINTEGRATION_OR_HONEY_COMBING),
    check_cracks: opts(C.CRACKS),
    check_exposed_reinforcement: opts(C.CHECK_EXPOSED_REINFORCEMENT),
    check_wear_of_deck_surface: opts(C.CHECK_WEAR_OF_DECK_SURFACE),
    check_scaling: opts(C.CHECK_SCALING),
    check_surface_stains_and_rust_stains: opts(C.CHECK_SURFACE_STains_AND_RUST_STains),
    check_leaching: opts(C.CHECK_LEACHING),
    check_corrosion_of_reinforcements: opts(C.CHECK_CORROSION_OF_REINFORCEMENTS),
    check_leakage: opts(C.CHECK_LEAKAGE),
    check_damages_due_to_moving_vehicles: opts(C.CHECK_DAMAGES_DUE_TO_MOVING_VEHICLES),
    check_condition_of_articulation: opts(C.CHECK_CONDITION_OF_ARTICULATION),
    check_excessive_vibrations: opts(C.CHECK_EXCESSIVE_VIBRATIONS),
    check_excessive_deflections_loss_of_camber: opts(C.CHECK_EXCESSIVE_DEFLECTIONS_LOSS_OF_CAMBER),
    check_cracks_around_anchorage_zone: opts(C.CHECK_CRACKS_AROUND_ANCHORAGE_ZONE),
    check_excessive_deflections_at_central_hinge: opts(C.CHECK_EXCESSIVE_DEFLECTIONS_AT_CENTRAL_HINGE),
    in_box_girders: opts(C.IN_BOX_GIRDERS),
    check_accumulation_of_slit: opts(C.CHECK_ACCUMULATION_OF_SLIT),
    check_peeling_off: opts(C.CHECK_PEELING_OFF),
    check_steel_members: opts(C.CHECK_STEEL_MEMBERS),
    check_condition_of_protective_system: opts(C.CHECK_CONDITION_OF_PROTECTIVE_SYSTEM),
    check_corrosion_if_any: opts(C.CHECK_CORROSION_IF_ANY),
    check_excessive_vibrations_if_any: opts(C.CHECK_EXCESSIVE_VIBRATIONS_IF_ANY),
    check_alignment_of_members: opts(C.CHECK_ALIGNMENT_OF_MEMBERS),
    check_excessive_loss_of_camber_and_excessive_deflection: opts(
      C.CHECK_EXCESSIVE_LOSS_OF_CAMBER_AND_EXCESSIVE_DEFLECTION
    ),
    check_apparent_fracture: opts(C.APPARENT_FRACTURE),
    masonry_arches: opts(C.CHECK_MASONRY_ARCHES),
    masonry_joints: opts(C.CHECK_MASONRY_JOINTS),
    arch_profile: opts(C.CHECK_ARCH_PROFILE),
    arch_cracks: opts(C.CHECK_ARCH_CRACKS),
    spandrel_drainage: opts(C.CHECK_SPANDREL_DRAINAGE),
    vegetation_growth: opts(C.CHECK_VEGETATION_GROWTH),
    iron_components: opts(C.CHECK_IRON_COMPONENTS),
    steel_bridge_condition: opts(C.CHECK_STEEL_BRIDGE_CONDITION),
    masonry_bridge_condition: opts(C.CHECK_MASONRY_BRIDGE_CONDITION),
    vegetation_present: opts(C.CHECK_VEGETATION_PRESENT),
  },

  expansion_joint: {
    expansion_type_a1: opts(C.CHECK_EXPANSION_TYPE_A1),
    expansion_type_a2: opts(C.CHECK_EXPANSION_TYPE_A2),
    expansion_condition_a1: opts(C.CHECK_EXPANSION_CONDITION_A1),
    expansion_condition_a2: opts(C.CHECK_EXPANSION_CONDITION_A2),
    functioning_a1: opts(C.CHECK_FUNCTIONING_A1),
    functioning_a2: opts(C.CHECK_FUNCTIONING_A2),
    sealing_material_a1: opts(C.CHECK_SEALING_MATERIAL_A1),
    sealing_material_a2: opts(C.CHECK_SEALING_MATERIAL_A2),
    check_secureness_of_the_joints_a1: opts(C.CHECK_SECURENESS_OF_THE_JOINTS_A1),
    check_secureness_of_the_joints_a2: opts(C.CHECK_SECURENESS_OF_THE_JOINTS_A2),
    top_sliding_plate_a1: opts(C.CHECK_TOP_SLIDING_PLATE_A1),
    top_sliding_plate_a2: opts(C.CHECK_TOP_SLIDING_PLATE_A2),
    locking_of_joints_a1: opts(C.CHECK_LOCKING_OF_JOINTS_A1),
    locking_of_joints_a2: opts(C.CHECK_LOCKING_OF_JOINTS_A2),
    derbis_in_joints_a1: opts(C.CHECK_DERBIS_IN_JOINTS_A1),
    derbis_in_joints_a2: opts(C.CHECK_DERBIS_IN_JOINTS_A2),
    report_rattling_a1: opts(C.CHECK_REPORT_RATTLING_A1),
    report_rattling_a2: opts(C.CHECK_REPORT_RATTLING_A2),
    drainage_from_expansion_joint_a1: opts(C.CHECK_DRAINAGE_FROM_EXPANSION_JOINT_A1),
    drainage_from_expansion_joint_a2: opts(C.CHECK_DRAINAGE_FROM_EXPANSION_JOINT_A2),
    alignment_and_clearance_a1: opts(C.CHECK_ALIGNMENT_AND_CLEARANCE_A1),
    alignment_and_clearance_a2: opts(C.CHECK_ALIGNMENT_AND_CLEARANCE_A2),
  },

  wearing_coat: {
    wearing_coat_material: opts(C.WEARING_COAT_MATERIAL),
    surface_condition: opts(C.SURFACE_CONDITION),
  },

  drainage_spouts_and_vest_holes: {
    check_clogging_lhs: opts(C.CHECK_CLOGGING_DETERIORATION_LHS),
    check_clogging_rhs: opts(C.CHECK_CLOGGING_DETERIORATION_RHS),
    check_projection_of_spout_lhs: opts(C.CHECK_PROJECTION_OF_SPOUT_LHS),
    check_projection_of_spout_rhs: opts(C.CHECK_PROJECTION_OF_SPOUT_RHS),
    check_adequacy_thereof_lhs: opts(C.CHECK_ADEQUACY_THEROF_LHS),
    check_adequacy_thereof_rhs: opts(C.CHECK_ADEQUACY_THEROF_RHS),
    for_subway_reports_lhs: opts(C.CHECK_REPORT_ABOUT_ADEQUACY_LHS),
    for_subway_reports_rhs: opts(C.CHECK_REPORT_ABOUT_ADEQUACY_RHS),
    report_absence_of_drainage_spouts_lhs: opts(C.CHECK_ABSENCE_OF_DRAINAGE_SPOUTS_LHS),
    report_absence_of_drainage_spouts_rhs: opts(C.CHECK_ABSENCE_OF_DRAINAGE_SPOUTS_RHS),
    check_choking_of_drainage_holes_lhs: opts(C.CHECK_CHOKING_OF_DRAINAGE_HOLES_LHS),
    check_choking_of_drainage_holes_rhs: opts(C.CHECK_CHOKING_OF_DRAINAGE_HOLES_RHS),
    drainage_distress_type: [
      { value: '', label: 'NA' },
      { value: 'Clogging', label: 'Clogging' },
      { value: 'Deterioration', label: 'Deterioration' },
      { value: 'Damage', label: 'Damage' },
    ],
  },

  handrails: {
    present_lhs: [
      { value: '', label: 'Select' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    present_rhs: [
      { value: '', label: 'Select' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    material_lhs: opts(C.MATERIAL_LHS),
    material_rhs: opts(C.MATERIAL_RHS),
    conditions_lhs: opts(C.CONDITION_LHS),
    conditions_rhs: opts(C.CONDITION_RHS),
    expansion_joint_gap_lhs: opts(C.EXPANSION_JOINT_GAP_LHS),
    expansion_joint_gap_rhs: opts(C.EXPANSION_JOINT_GAP_RHS),
    inspection_galley_ladder_platform_lhs: opts(C.INSPECTION_GALLERY_LADDER_PLATFORM_LHS),
    inspection_galley_ladder_platform_rhs: opts(C.INSPECTION_GALLERY_LADDER_PLATFORM_RHS),
    whether_guard_rail_or_crash_barrier: opts(C.WHETHER_GUARD_RAIL_CASH_BARRIER),
    handrails_distress_type: opts(C.HANDRAILS_EXPANSION_JOINT_DISTRESS_TYPE),
  },

  footpaths: {
    present_lhs: [
      { value: '', label: 'Select' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    present_rhs: [
      { value: '', label: 'Select' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    material_lhs: opts(C.FOOTPATH_MATERIAL_LHS),
    material_rhs: opts(C.FOOTPATH_MATERIAL_RHS),
    conditions_lhs: opts(C.FOOTPATH_CONDITION_LHS),
    conditions_rhs: opts(C.FOOTPATH_CONDITION_RHS),
  },

  utilities: {
    present_lhs: [
      { value: '', label: 'Select' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    present_rhs: [
      { value: '', label: 'Select' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
    type_of_utility_lhs: opts(C.TYPE_OF_UTILITY_LHS),
    type_of_utility_rhs: opts(C.TYPE_OF_UTILITY_RHS),
    any_type_of_encroachment_lhs: opts(C.TYPE_OF_ENCROACHMENT_LHS),
    any_type_of_encroachment_rhs: opts(C.TYPE_OF_ENCROACHMENT_RHS),
    utilities_distress_type: opts({ '': 'Select Distress', ...utilitiesDamageType }),
  },

  foundation: {
    type_bridge: opts(C.CHECK_TYPE_BRIDGE),
    foundation_material: opts(C.CHECK_FOUNDATION_MATERIAL),
    condition_of_foundation: opts(C.CHECK_CONDITION_OF_FOUNDATION),
    floating_bodies: opts(C.CHECK_FLOATING_BODIES),
  },

  substructure: {
    type_a1: opts(C.CHECK_TYPE_A1),
    type_a2: opts(C.CHECK_TYPE_A2),
    substructure_material_a1: opts(C.CHECK_MATERIAL_A1),
    substructure_material_a2: opts(C.CHECK_MATERIAL_A2),
    condition_a1: opts(C.CHECK_CONDITION_A1),
    condition_a2: opts(C.CHECK_CONDITION_A2),
    efficiency_drainage_a1: opts(C.CHECK_EFFICIENCY_OF_DRAINAGE_A1),
    efficiency_drainage_a2: opts(C.CHECK_EFFICIENCY_OF_DRAINAGE_A2),
    pier_condition: opts(C.CHECK_PIER_CONDITION),
    large_excavations_done: opts(C.CHECK_LARGE_EXCAVATIONS_DONE),
    damages_to_protective_measures: opts(C.CHECK_DAMAGES_TO_PROTECTIVE_MEASURES),
    damages_to_protective_coating_or_paint: opts(C.CHECK_DAMAGES_TO_PROTECTIVE_COATING_OR_PAINT),
  },

  subways: {
    pier_condition: opts(C.CHECK_PIER_CONDITION),
    large_excavations_done: opts(C.CHECK_LARGE_EXCAVATIONS_DONE),
    damages_to_protective_measures: opts(C.CHECK_DAMAGES_TO_PROTECTIVE_MEASURES),
    damages_to_protective_coating_or_paint: opts(C.CHECK_DAMAGES_TO_PROTECTIVE_COATING_OR_PAINT),
    condition_distress: opts(C.CHECK_PIER_CONDITION),
    excavations_distress: opts(C.CHECK_SUBWAYS_EXCAVATIONS_DISTRESS),
    protective_measures_distress: opts(C.CHECK_SUBWAYS_PROTECTIVE_MEASURES_DISTRESS),
  },

  bearing_and_pedestal: {
    type_and_allowable_movements_bearing: opts(C.CHECK_TYPE_AND_ALLOWABLE_MOVEMENTS_BEARING),
    type_and_allowable_movements_pedestal: opts(C.CHECK_TYPE_AND_ALLOWABLE_MOVEMENTS_PEDESTAL),
    material_bearing: opts(C.CHECK_MATERIAL_BEARING),
    material_pedestal: opts(C.CHECK_MATERIAL_PEDESTAL),
    general_condition_bearing: opts(C.CHECK_GENERAL_CONDITION_BEARING),
    general_condition_pedestal: opts(C.CHECK_GENERAL_CONDITION_PEDESTAL),
    functioning_bearing: opts(C.CHECK_FUNCTIONING_BEARING),
    functioning_pedestal: opts(C.CHECK_FUNCTIONING_PEDESTAL),
  },

  waterway: {
    check_presence_of_obstruction_in_flow: opts(C.CHECK_PRESENCE_OF_OBSTRUCTION),
    flow_pattern: opts(C.CHECK_FLOW_PATTERN),
  },

  protection_works: {
    type: opts(C.CHECK_TYPE),
    slope_pitching_apron_and_toe_walls: opts(C.CHECK_SLOPE_PITICHING_APRON_ANDTOE_WALLS),
    floor_protection_works: opts(C.CHECK_FLOOR_PROTECTION_WORKS),
    scour_for_abutments: opts(C.CHECK_SCOUR_FOR_ABUTMENTS),
    scour_for_piers: opts(C.CHECK_SCOUR_FOR_PIERS),
    reserve_store_material: opts(C.CHECK_RESERVE_STORE_MATERIAL),
  },
}
