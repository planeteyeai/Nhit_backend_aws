-- Generated from schema order in ramsneyv_bms1.pdf
-- Source DB: railway @ caboose.proxy.rlwy.net:21737
-- Generated at: 2026-04-01T13:15:15.863Z

-- NOTE: tables present in DB but not listed in PDF TOC:
--   - Dashboard_projects (replaces legacy PowerBI)
--   - powerbidash

SET FOREIGN_KEY_CHECKS=0;

-- ----------------------------
-- Table: age_of_bridge
-- ----------------------------
DROP TABLE IF EXISTS `age_of_bridge`;
CREATE TABLE `age_of_bridge` (
  `age_id` int NOT NULL AUTO_INCREMENT,
  `age_when_inspection_done_first` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `age_code` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`age_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: approaches
-- ----------------------------
DROP TABLE IF EXISTS `approaches`;
CREATE TABLE `approaches` (
  `approaches_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `type_of_terrain` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_of_approach` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material_of_approach` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `approach_geometrics` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `approaches_having_span` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pavement_surface` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pavement_surface_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `pothole_length` float(10,2) NOT NULL,
  `pothole_width` float(10,2) NOT NULL,
  `pothole_depth` float(10,2) NOT NULL,
  `cracking_length` float(10,2) NOT NULL,
  `cracking_width` float(10,2) NOT NULL,
  `cracking_depth` float(10,2) NOT NULL,
  `side_slopes` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `erosion_of_embankment_by_rain_cuts_or_any_other_damage` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `erosion_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `approach_slab` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `approach_slab_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `wall_type_and_height` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `retaining_wall_condition` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `retaining_wall_condition_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `silt_and_debris` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `silt_and_debris_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: approaches_bridge
-- ----------------------------
DROP TABLE IF EXISTS `approaches_bridge`;
CREATE TABLE `approaches_bridge` (
  `approaches_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `type_of_terrain` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_of_approach` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material_of_approach` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `approach_geometrics` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `approaches_having_span` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `wall_type_and_height` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bearing_and_pedistal
-- ----------------------------
DROP TABLE IF EXISTS `bearing_and_pedistal`;
CREATE TABLE `bearing_and_pedistal` (
  `bearing_and_pedistal_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `bearing_no_per_abutment` text COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_no_per_abutment` text COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_no_per_pier` text COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_no_per_pier` text COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_total` int NOT NULL,
  `pedestal_total` int NOT NULL,
  `pier_bearing_total` int NOT NULL,
  `pier_pedestal_total` int NOT NULL,
  `total_piers_at_add` int NOT NULL,
  `bearing_type_allowable_movements` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_type_allowable_movements` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_general_condition` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_general_condition` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_functioning` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_functioning` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `general_condition_images` text COLLATE utf8mb4_general_ci,
  `functioning_images` text COLLATE utf8mb4_general_ci,
  `bearing_condition` text COLLATE utf8mb4_general_ci NOT NULL,
  `name_of_span` varchar(250) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bearing_and_pedistal_bridge
-- ----------------------------
DROP TABLE IF EXISTS `bearing_and_pedistal_bridge`;
CREATE TABLE `bearing_and_pedistal_bridge` (
  `bearing_and_pedistal_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `bearing_no_per_abutment` text COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_no_per_abutment` text COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_no_per_pier` text COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_no_per_pier` text COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_total` int NOT NULL,
  `pedestal_total` int NOT NULL,
  `pier_bearing_total` int NOT NULL,
  `pier_pedestal_total` int NOT NULL,
  `total_piers_at_add` int NOT NULL,
  `bearing_type_allowable_movements` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_type_allowable_movements` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `metallic_bearings` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `elastomeric_bearing` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bearing_and_pedistal_condition
-- ----------------------------
DROP TABLE IF EXISTS `bearing_and_pedistal_condition`;
CREATE TABLE `bearing_and_pedistal_condition` (
  `bpc_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `bearing_and_pedistal_id` int NOT NULL,
  `pedestal_condition` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `pedestal_condition_length` float NOT NULL,
  `pedestal_condition_width` float NOT NULL,
  `pedestal_condition_depth` float NOT NULL,
  `pedestal_condition_distance_x` float NOT NULL,
  `pedestal_condition_distance_y` float NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `name_of_span` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `repair_methodology` text COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bearing_rating_details
-- ----------------------------
DROP TABLE IF EXISTS `bearing_rating_details`;
CREATE TABLE `bearing_rating_details` (
  `id` int unsigned NOT NULL,
  `bridge_inspection_id` int unsigned NOT NULL,
  `component_type` varchar(100) NOT NULL,
  `form_no` int unsigned NOT NULL,
  `bearing_name` varchar(255) DEFAULT NULL,
  `bearing_type` varchar(255) DEFAULT NULL,
  `bearing_condition` text,
  `images` text,
  `created_by` int unsigned DEFAULT NULL,
  `created_on` datetime DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `updated_on` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- ----------------------------
-- Table: bridge
-- ----------------------------
DROP TABLE IF EXISTS `bridge`;
CREATE TABLE `bridge` (
  `bridge_id` int NOT NULL AUTO_INCREMENT,
  `project_name` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `state_id` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `zone` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `road_type` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `highway_no` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `chainage` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_no` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `direction_of_inventory_start` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `direction_of_inventory_end` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `latitude` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `longitude` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `date` datetime NOT NULL,
  `consultant_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `popular_name_of_bridge` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `custodian` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `engineer_designation` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `contact_details` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `email_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `departmental_chainage` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `departmental_bridge_number` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_side` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `width_of_bridge` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `length_of_bridge` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `height_of_bridge` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `total_no_of_span` int NOT NULL,
  `traffic_lane_on_bridge` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `type_of_bridge` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `age_of_bridge` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `structural_form` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `material_of_construction` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `loading_as_per_irc` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `hydraluic_tone_weightage` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `pay_load` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_crossing_feature` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `rating_of_deck_geometry` text COLLATE utf8mb4_general_ci NOT NULL,
  `rating_for_vertical_clearance` text COLLATE utf8mb4_general_ci NOT NULL,
  `rating_of_waterway_adequacy` text COLLATE utf8mb4_general_ci NOT NULL,
  `rating_of_average_daily_traffic` text COLLATE utf8mb4_general_ci NOT NULL,
  `rating_for_social_importance` text COLLATE utf8mb4_general_ci NOT NULL,
  `rating_for_economic_growth_potential` text COLLATE utf8mb4_general_ci NOT NULL,
  `rating_alternate_route` text COLLATE utf8mb4_general_ci NOT NULL,
  `rating_environmental_impact` text COLLATE utf8mb4_general_ci NOT NULL,
  `structure_data_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `general_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `approaches_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `protection_works_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `foundation_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `substructure_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bearing_and_pedistal_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `superstructure_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `expansion_joint_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `wearing_coat_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `handrails_parapets_crash_barriers_bridge` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bridge_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed','Closed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Pending',
  `created_on` date NOT NULL,
  `created_by` int NOT NULL,
  `updated_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `form_filled` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No' COMMENT 'Check for all form submitted till last step',
  `bmc_status` enum('No','Approved','Rejected') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bmc_user` int NOT NULL,
  `bmc_status_updated_on` date DEFAULT NULL,
  `is_inspecion_schedule` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bridge_identity_no` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `design_discharge_in_cumecs` float DEFAULT NULL,
  PRIMARY KEY (`bridge_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bridge_inspection
-- ----------------------------
DROP TABLE IF EXISTS `bridge_inspection`;
CREATE TABLE `bridge_inspection` (
  `bridge_inspection_id` int NOT NULL AUTO_INCREMENT,
  `bridge_id` int NOT NULL,
  `state_id` int NOT NULL,
  `zone_id` int NOT NULL,
  `design_discharge_in_cumecs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `design_hfl_and_lwl` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `design_scour_level_at_pier` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `design_scour_level_at_abutment` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `founding_strata` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `water_body_lowest_level` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `whether_the_bridge_is_in_grade` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `road_formation_level` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `ground_level` float(10,4) NOT NULL,
  `deck_soft_level_of_superstructure` float(10,4) NOT NULL,
  `clear_carriageway_width` float(10,4) NOT NULL,
  `overall_deck_width` float(10,4) NOT NULL,
  `roadway_width_for_approaches` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `safety_kerb_width` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `footpath_width` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_railing_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_railing_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_railing_width` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `whether_median_if_yes_its_width` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `shoulder_width` float(10,4) NOT NULL,
  `shoulder_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `height_of_approach_embankment` float(10,4) NOT NULL,
  `average_skew` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `whether_navigable` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `horizontal_clearance` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `vertical_clearence` float(10,4) NOT NULL,
  `hign_level_submersible_causeway` enum('High-Level','Submersible','Causeway') COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_inspection` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `general` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `approaches` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `protection_works` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `waterway` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `foundation` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `substructure` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `for_subways` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bearing_and_pedestal` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `superstructure` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `expansion_joint` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `wearing_coat` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `drainage_spouts_and_vest_holes` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `hand_rails_&_parapets_walls` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `footpaths` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `utilities` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bridge_number` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `environment` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `aesthetics` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bmc_inspection_status` enum('No','Approved','Rejected') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `bmc_user` int NOT NULL,
  `bmc_inspection_status_date` date DEFAULT NULL,
  `remark` text COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Confirmed','Approved','Closed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `upadted_on` date NOT NULL,
  `boq_structure_layout_images` text COLLATE utf8mb4_general_ci COMMENT 'JSON array of structure layout image file paths',
  `boq_conclusion_report` text COLLATE utf8mb4_general_ci COMMENT 'Conclusion Report text for PDF',
  `boq_causes_of_distress` text COLLATE utf8mb4_general_ci COMMENT 'Causes of Distress text for PDF',
  `boq_remedial_measures` text COLLATE utf8mb4_general_ci COMMENT 'Remedial Measures text for PDF',
  `boq_repair_methodology` text COLLATE utf8mb4_general_ci COMMENT 'Repair Methodology text for PDF',
  PRIMARY KEY (`bridge_inspection_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bridge_inspection_distress
-- ----------------------------
DROP TABLE IF EXISTS `bridge_inspection_distress`;
CREATE TABLE `bridge_inspection_distress` (
  `id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `table_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `distress_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `name_of_span` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `field_type` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `distress_length` float(10,4) NOT NULL DEFAULT '0.0000',
  `distress_width` float(10,4) NOT NULL DEFAULT '0.0000',
  `distress_depth` float(10,4) NOT NULL DEFAULT '0.0000',
  `distance_of_distress_x` float(10,4) NOT NULL DEFAULT '0.0000',
  `distance_of_distress_y` float(10,4) NOT NULL DEFAULT '0.0000',
  `abutment_A1` int NOT NULL DEFAULT '0',
  `abutment_A2` int NOT NULL DEFAULT '0',
  `piers` int NOT NULL DEFAULT '0',
  `spans` int NOT NULL DEFAULT '0',
  `foundation` int NOT NULL DEFAULT '0',
  `expansion` int NOT NULL DEFAULT '0',
  `lhs_distress` int NOT NULL,
  `rhs_distress` int NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `repair_methodology` text COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bridge_inspection_rejection_comment
-- ----------------------------
DROP TABLE IF EXISTS `bridge_inspection_rejection_comment`;
CREATE TABLE `bridge_inspection_rejection_comment` (
  `rejection_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `comment` text COLLATE utf8mb4_general_ci NOT NULL,
  `comment_by` int NOT NULL,
  `comment_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bridge_rejection_comment
-- ----------------------------
DROP TABLE IF EXISTS `bridge_rejection_comment`;
CREATE TABLE `bridge_rejection_comment` (
  `rejection_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `comment` text COLLATE utf8mb4_general_ci NOT NULL,
  `comment_by` int NOT NULL,
  `comment_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: bridge_side
-- ----------------------------
DROP TABLE IF EXISTS `bridge_side`;
CREATE TABLE `bridge_side` (
  `id` int NOT NULL,
  `bridge_sides` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: company_firms
-- ----------------------------
DROP TABLE IF EXISTS `company_firms`;
CREATE TABLE `company_firms` (
  `firm_id` int NOT NULL,
  `firm_name` varchar(100) NOT NULL,
  `firm_code` varchar(5) NOT NULL,
  `current_year` varchar(7) NOT NULL,
  `current_challan` int NOT NULL,
  `current_invoice` int NOT NULL,
  `credit_number` int NOT NULL,
  `debit_number` int NOT NULL,
  `cash_invoice_no` int NOT NULL DEFAULT '0',
  `lot_no` int NOT NULL DEFAULT '0',
  `rev_no` int NOT NULL,
  `year_code` varchar(100) NOT NULL,
  `grin_no` int NOT NULL,
  `mid_no` int NOT NULL,
  `material_inward_no` int NOT NULL DEFAULT '0',
  `order_id` int NOT NULL,
  `quotation_id` int NOT NULL,
  `spo_number` int NOT NULL,
  `sales_order_id` int NOT NULL,
  `po_number` int NOT NULL DEFAULT '0',
  `inward_stock_id` int NOT NULL,
  `stock_transfer_id` int NOT NULL,
  `gst_num` varchar(15) NOT NULL,
  `state_code` int NOT NULL DEFAULT '0',
  `state_name` varchar(15) NOT NULL,
  `firm_address` text NOT NULL,
  `firm_email` varchar(150) NOT NULL,
  `firm_mobile` varchar(50) NOT NULL,
  `firm_jurisdiction` varchar(50) NOT NULL,
  `logo_image` varchar(30) NOT NULL,
  `status` varchar(10) NOT NULL DEFAULT 'Active' COMMENT '''Active'',''In-Active''',
  `parent_firm` int NOT NULL,
  `disply_name` varchar(256) NOT NULL,
  `asso_client_id` int NOT NULL,
  `asso_supplier_id` int NOT NULL,
  `receipt_number` int NOT NULL,
  `booking_id` int NOT NULL,
  `job_number` int NOT NULL,
  `address` text NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb3;

-- ----------------------------
-- Table: component_pier_rating
-- ----------------------------
DROP TABLE IF EXISTS `component_pier_rating`;
CREATE TABLE `component_pier_rating` (
  `component_pier_id` int NOT NULL,
  `component_pier_rating_code` int NOT NULL,
  `component_pier_rating` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `component_pier_rating_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: drainage_spouts_and_vest_holes
-- ----------------------------
DROP TABLE IF EXISTS `drainage_spouts_and_vest_holes`;
CREATE TABLE `drainage_spouts_and_vest_holes` (
  `drainage_spouts_and_vest_holes_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `check_clogging_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_clogging_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `distress_length` float(10,2) NOT NULL,
  `distress_width` float(10,2) NOT NULL,
  `distress_depth` float(10,2) NOT NULL,
  `check_projection_of_spout_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_projection_of_spout_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_adequacy_thereof_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_adequacy_thereof_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `for_subway_reports_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `for_subway_reports_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `for_submersible_bridges_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `for_submersible_bridges_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_absence_of_drainage_spouts_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_absence_of_drainage_spouts_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_choking_of_drainage_holes_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_choking_of_drainage_holes_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_clogging_images` text COLLATE utf8mb4_general_ci,
  `check_projection_of_spout_images` text COLLATE utf8mb4_general_ci,
  `check_adequacy_thereof_images` text COLLATE utf8mb4_general_ci,
  `for_subway_reports_images` text COLLATE utf8mb4_general_ci,
  `for_submersible_bridges_images` text COLLATE utf8mb4_general_ci,
  `report_absence_of_drainage_spouts_images` text COLLATE utf8mb4_general_ci,
  `check_choking_of_drainage_holes_images` text COLLATE utf8mb4_general_ci,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: expansion_joint
-- ----------------------------
DROP TABLE IF EXISTS `expansion_joint`;
CREATE TABLE `expansion_joint` (
  `expansion_joint_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `type_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `functioning_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `functioning_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `expansion_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `name_of_span` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `condition_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `functioning_distress_length` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `functioning_distress_width` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `functioning_distress_depth` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `sealing_material_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `sealing_material_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_secureness_of_the_joints_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_secureness_of_the_joints_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `top_sliding_plate_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `top_sliding_plate_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `locking_of_joints_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `locking_of_joints_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_for_debris_in_joints_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_for_debris_in_joints_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_rattling_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_rattling_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_drainage_from_expansion_joint_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_drainage_from_expansion_joint_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_alignment_and_clearance_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_alignment_and_clearance_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `type_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `condition_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `condition_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `functioning_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `functioning_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `sealing_material_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `sealing_material_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_secureness_of_the_joints_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_secureness_of_the_joints_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `top_sliding_plate_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `top_sliding_plate_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `locking_of_joints_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `locking_of_joints_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_for_debris_in_joints_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_for_debris_in_joints_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `report_rattling_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `report_rattling_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_drainage_from_expansion_joint_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_drainage_from_expansion_joint_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_alignment_and_clearance_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `check_alignment_and_clearance_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed','Deleted') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: expansion_joint_bridge
-- ----------------------------
DROP TABLE IF EXISTS `expansion_joint_bridge`;
CREATE TABLE `expansion_joint_bridge` (
  `expansion_joint_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `type_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: expansion_joint_bridge_items
-- ----------------------------
DROP TABLE IF EXISTS `expansion_joint_bridge_items`;
CREATE TABLE `expansion_joint_bridge_items` (
  `id` int unsigned NOT NULL,
  `bridge_id` int unsigned NOT NULL,
  `expansion_name` varchar(255) NOT NULL,
  `expansion_type` varchar(255) NOT NULL,
  `default_condition` varchar(100) NOT NULL DEFAULT 'Good',
  `display_order` int unsigned NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_on` datetime DEFAULT NULL,
  `updated_by` int unsigned DEFAULT NULL,
  `updated_on` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

-- ----------------------------
-- Table: expansion_joint_pilers
-- ----------------------------
DROP TABLE IF EXISTS `expansion_joint_pilers`;
CREATE TABLE `expansion_joint_pilers` (
  `expansion_pilers_id` int NOT NULL,
  `expansion_joint_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `functioning` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `sealing_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_secureness_of_the_joints` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `top_sliding_plate` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `locking_of_joints` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_for_debris_in_joints` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_rattling` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_drainage_from_expansion_joint` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_alignment_and_clearance` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `piler_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `piler_images` text COLLATE utf8mb4_general_ci,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: footpaths
-- ----------------------------
DROP TABLE IF EXISTS `footpaths`;
CREATE TABLE `footpaths` (
  `footpath_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `present_lhs` enum('Yes','No') COLLATE utf8mb4_general_ci NOT NULL,
  `present_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `conditions_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `conditions_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: foundation
-- ----------------------------
DROP TABLE IF EXISTS `foundation`;
CREATE TABLE `foundation` (
  `foundation_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `foundation_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `foundation_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `floating_bodies_boulders` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `floating_bodies_boulders_image` text COLLATE utf8mb4_general_ci,
  `seepage_vehicle_impact` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `seepage_vehicle_impact_image` text COLLATE utf8mb4_general_ci,
  `condition_of_foundation` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition_of_foundation_image` text COLLATE utf8mb4_general_ci,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Active',
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: foundation_bridge
-- ----------------------------
DROP TABLE IF EXISTS `foundation_bridge`;
CREATE TABLE `foundation_bridge` (
  `foundation_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `foundation_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Active',
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: general
-- ----------------------------
DROP TABLE IF EXISTS `general`;
CREATE TABLE `general` (
  `general_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `corrosion_protection_measures` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bank_protection_and_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `floor_protection` enum('Yes','No') COLLATE utf8mb4_general_ci NOT NULL,
  `floor_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_located_in_back_water_or_chemical_affected_water` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `whether_guard_rail_or_crash_barrier` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: general_bridge
-- ----------------------------
DROP TABLE IF EXISTS `general_bridge`;
CREATE TABLE `general_bridge` (
  `general_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `corrosion_protection_measures` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bank_protection_and_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `floor_protection` enum('Yes','No') COLLATE utf8mb4_general_ci NOT NULL,
  `floor_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_located_in_back_water_or_chemical_affected_water` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: handrails_parapets_crash_barriers
-- ----------------------------
DROP TABLE IF EXISTS `handrails_parapets_crash_barriers`;
CREATE TABLE `handrails_parapets_crash_barriers` (
  `handrails_parapets_crash_barriers_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `present_lhs` enum('Yes','No') COLLATE utf8mb4_general_ci NOT NULL,
  `present_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `conditions_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `conditions_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `expansion_joint_gap_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `expansion_joint_gap_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `distress_length` float(10,2) NOT NULL,
  `distress_width` float(10,2) NOT NULL,
  `distress_depth` float(10,2) NOT NULL,
  `present_of_additional_safety_measures_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `present_of_additional_safety_measures_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `presence_of_towers_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `presence_of_towers_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `inspection_galley_ladder_platform_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `inspection_galley_ladder_platform_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `whether_guard_rail_or_crash_barrier` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `expansion_joint_gap_images` text COLLATE utf8mb4_general_ci,
  `present_of_additional_safety_measures_images` text COLLATE utf8mb4_general_ci,
  `presence_of_towers_images` text COLLATE utf8mb4_general_ci,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: handrails_parapets_crash_barriers_bridge
-- ----------------------------
DROP TABLE IF EXISTS `handrails_parapets_crash_barriers_bridge`;
CREATE TABLE `handrails_parapets_crash_barriers_bridge` (
  `handrails_parapets_crash_barriers_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `material_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `material_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: hydraluic_tone_weightage
-- ----------------------------
DROP TABLE IF EXISTS `hydraluic_tone_weightage`;
CREATE TABLE `hydraluic_tone_weightage` (
  `htw_id` int NOT NULL,
  `hydraluic_tone_code` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `hydraluic_tone_rating` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: inspection_cause_rating
-- ----------------------------
DROP TABLE IF EXISTS `inspection_cause_rating`;
CREATE TABLE `inspection_cause_rating` (
  `id` int NOT NULL,
  `inspection_distress_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `component_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `foundation` int NOT NULL,
  `wearing_coat` int NOT NULL,
  `expansion_joint` int NOT NULL,
  `superstructure` int NOT NULL,
  `distress_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `impact` int NOT NULL,
  `abrasion` int NOT NULL,
  `erosion` int NOT NULL,
  `overload` int NOT NULL,
  `fatigue` int NOT NULL,
  `temprature` int NOT NULL,
  `shrinkage` int NOT NULL,
  `settlement` int NOT NULL,
  `carbon_dioxide` int NOT NULL,
  `sulphates` int NOT NULL,
  `carbonation` int NOT NULL,
  `alkali` int NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: inspection_component_rating
-- ----------------------------
DROP TABLE IF EXISTS `inspection_component_rating`;
CREATE TABLE `inspection_component_rating` (
  `id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `rating_id` int NOT NULL,
  `component_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_and_pedestal_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bearing_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `component_name` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `foundation_id` int NOT NULL,
  `superstructure_id` int NOT NULL,
  `expansion_joint_id` int NOT NULL,
  `form_no` int NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL,
  `repair_methodology` text COLLATE utf8mb4_general_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: inspection_repair_methodology_map
-- ----------------------------
DROP TABLE IF EXISTS `inspection_repair_methodology_map`;
CREATE TABLE `inspection_repair_methodology_map` (
  `id` int unsigned NOT NULL,
  `bridge_inspection_id` int unsigned NOT NULL,
  `category` enum('structural','non_structural') COLLATE utf8mb3_unicode_ci NOT NULL,
  `distress_key` varchar(64) COLLATE utf8mb3_unicode_ci NOT NULL,
  `repair_methodology` text COLLATE utf8mb3_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

-- ----------------------------
-- Table: loading_icr
-- ----------------------------
DROP TABLE IF EXISTS `loading_icr`;
CREATE TABLE `loading_icr` (
  `l_id` int NOT NULL,
  `loading_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `allowed_loading` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `loading_rating_code` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: material_of_construction
-- ----------------------------
DROP TABLE IF EXISTS `material_of_construction`;
CREATE TABLE `material_of_construction` (
  `moc_id` int NOT NULL,
  `material_of_construction_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `material_of_construction_description` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: material_of_construction_bkp
-- ----------------------------
DROP TABLE IF EXISTS `material_of_construction_bkp`;
CREATE TABLE `material_of_construction_bkp` (
  `moc_id` int NOT NULL,
  `material_of_construction_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `material_of_construction_description` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: non_structural_distress
-- ----------------------------
 DROP TABLE IF EXISTS `non_structural_distress`;
 CREATE TABLE `non_structural_distress` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `bridge_inspection_id` INT NOT NULL,

  `table_type` VARCHAR(256) NOT NULL,
  `element_type` VARCHAR(255) DEFAULT NULL,
  `element_description` TEXT,

  `distress_type` VARCHAR(256) NOT NULL,
  `field_type` VARCHAR(256) DEFAULT NULL,
  `name_of_span` VARCHAR(255) DEFAULT NULL,

  `distress_length` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `distress_width` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `distress_depth` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `distress_nos` INT DEFAULT NULL,

  `distance_of_distress_x` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  `distance_of_distress_y` DECIMAL(10,4) NOT NULL DEFAULT 0.0000,

  `abutment_A1` INT NOT NULL DEFAULT 0,
  `abutment_A2` INT NOT NULL DEFAULT 0,
  `piers` INT NOT NULL DEFAULT 0,
  `spans` INT NOT NULL DEFAULT 0,
  `foundation` INT NOT NULL DEFAULT 0,
  `expansion` INT NOT NULL DEFAULT 0,

  `lhs_distress` INT NOT NULL DEFAULT 0,
  `rhs_distress` INT NOT NULL DEFAULT 0,

  `condition_rating` VARCHAR(255) DEFAULT NULL,
  `material` VARCHAR(255) DEFAULT NULL,
  `maintenance_required` VARCHAR(255) DEFAULT NULL,
  `priority_level` VARCHAR(255) DEFAULT NULL,

  `inspection_notes` TEXT,
  `images` TEXT,
  `status` VARCHAR(255) DEFAULT NULL,

  `created_by` INT DEFAULT NULL,
  `created_on` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_by` INT DEFAULT NULL,
  `updated_on` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  `repair_methodology` TEXT,

  PRIMARY KEY (`id`),
  INDEX `idx_bridge_inspection_id` (`bridge_inspection_id`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: overall_bridge_rating
-- ----------------------------
DROP TABLE IF EXISTS `overall_bridge_rating`;
CREATE TABLE `overall_bridge_rating` (
  `id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `rating_id` int NOT NULL,
  `bmc_rejected` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'No',
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: protection_works
-- ----------------------------
DROP TABLE IF EXISTS `protection_works`;
CREATE TABLE `protection_works` (
  `protection_works_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `layout_cross_section_profile` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `slope_pitching_apron_and_toe_walls` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `floor_protection_works` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `scour_for_abutments` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `scour_for_abutments_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `scour_for_piers` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `scour_for_piers_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `reserve_store_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: protection_works_bridge
-- ----------------------------
DROP TABLE IF EXISTS `protection_works_bridge`;
CREATE TABLE `protection_works_bridge` (
  `protection_works_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `reserve_store_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_alternate_route
-- ----------------------------
DROP TABLE IF EXISTS `rating_alternate_route`;
CREATE TABLE `rating_alternate_route` (
  `route_id` int NOT NULL,
  `route_rating_code` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `route_rating` text COLLATE utf8mb4_general_ci NOT NULL,
  `route_rating_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_environmental_impact
-- ----------------------------
DROP TABLE IF EXISTS `rating_environmental_impact`;
CREATE TABLE `rating_environmental_impact` (
  `er_id` int NOT NULL,
  `environmental_impact_rating_code` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `environmental_impact_rating` text COLLATE utf8mb4_general_ci NOT NULL,
  `environmental_impact_rating_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_abrasion
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_abrasion`;
CREATE TABLE `rating_for_abrasion` (
  `rating_for_abrasion_id` int NOT NULL,
  `rating_for_abrasion_code` int NOT NULL,
  `rating_for_abrasion_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_alkali
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_alkali`;
CREATE TABLE `rating_for_alkali` (
  `rating_for_alkali_id` int NOT NULL,
  `rating_for_alkali_code` int NOT NULL,
  `rating_for_alkali_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_carbonation
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_carbonation`;
CREATE TABLE `rating_for_carbonation` (
  `rating_for_carbonation_id` int NOT NULL,
  `rating_for_carbonation_code` int NOT NULL,
  `rating_for_carbonation_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_carbon_dioxide
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_carbon_dioxide`;
CREATE TABLE `rating_for_carbon_dioxide` (
  `rating_for_carbon_dioxide_id` int NOT NULL,
  `rating_for_carbon_dioxide_code` int NOT NULL,
  `rating_for_carbon_dioxide_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_economic_growth_potential
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_economic_growth_potential`;
CREATE TABLE `rating_for_economic_growth_potential` (
  `economic_growth_potential_id` int NOT NULL,
  `economic_growth_potential_code` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `economic_growth_potential_rating` text COLLATE utf8mb4_general_ci NOT NULL,
  `economic_growth_potential_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_erosion
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_erosion`;
CREATE TABLE `rating_for_erosion` (
  `rating_for_erosion_id` int NOT NULL,
  `rating_for_erosion_code` int NOT NULL,
  `rating_for_erosion_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_fatigue
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_fatigue`;
CREATE TABLE `rating_for_fatigue` (
  `rating_for_fatigue_id` int NOT NULL,
  `rating_for_fatigue_code` int NOT NULL,
  `rating_for_fatigue_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_impact
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_impact`;
CREATE TABLE `rating_for_impact` (
  `rating_for_impact_id` int NOT NULL,
  `rating_for_impact_code` int NOT NULL,
  `rating_for_impact_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_overload
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_overload`;
CREATE TABLE `rating_for_overload` (
  `rating_for_overload_id` int NOT NULL,
  `rating_for_overload_code` int NOT NULL,
  `rating_for_overload_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_social_importance
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_social_importance`;
CREATE TABLE `rating_for_social_importance` (
  `social_importance_id` int NOT NULL,
  `social_importance_code` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `social_importance_rating` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `social_importance_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_sulphates
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_sulphates`;
CREATE TABLE `rating_for_sulphates` (
  `rating_for_sulphates_id` int NOT NULL,
  `rating_for_sulphates_code` int NOT NULL,
  `rating_for_sulphates_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_temperature
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_temperature`;
CREATE TABLE `rating_for_temperature` (
  `rating_for_temperature_id` int NOT NULL,
  `rating_for_temperature_code` int NOT NULL,
  `rating_for_temperature_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_for_vertical_clearance
-- ----------------------------
DROP TABLE IF EXISTS `rating_for_vertical_clearance`;
CREATE TABLE `rating_for_vertical_clearance` (
  `vertical_clearance_id` int NOT NULL,
  `road_type` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `vertical_clearance_rating_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `vertical_clearance_rating` varchar(100) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_of_average_daily_traffic
-- ----------------------------
DROP TABLE IF EXISTS `rating_of_average_daily_traffic`;
CREATE TABLE `rating_of_average_daily_traffic` (
  `daily_traffic_id` int NOT NULL,
  `traffic_rating_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `traffic_rating` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `traffic_rating_desc` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_of_deck_geometry
-- ----------------------------
DROP TABLE IF EXISTS `rating_of_deck_geometry`;
CREATE TABLE `rating_of_deck_geometry` (
  `geometry_rating_id` int NOT NULL,
  `geometry_rating_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `geometry_rating` varchar(100) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_of_settlement
-- ----------------------------
DROP TABLE IF EXISTS `rating_of_settlement`;
CREATE TABLE `rating_of_settlement` (
  `rating_of_settlement_id` int NOT NULL,
  `rating_of_settlement_code` int NOT NULL,
  `rating_of_settlement_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_of_shrinkage
-- ----------------------------
DROP TABLE IF EXISTS `rating_of_shrinkage`;
CREATE TABLE `rating_of_shrinkage` (
  `rating_of_shrinkage_id` int NOT NULL,
  `rating_of_shrinkage_code` int NOT NULL,
  `rating_of_shrinkage_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: rating_of_waterway_adequacy
-- ----------------------------
DROP TABLE IF EXISTS `rating_of_waterway_adequacy`;
CREATE TABLE `rating_of_waterway_adequacy` (
  `waterway_adequacy_id` int NOT NULL,
  `waterway_rating_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `waterway_rating` text COLLATE utf8mb4_general_ci NOT NULL,
  `waterway_rating_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: road_type
-- ----------------------------
DROP TABLE IF EXISTS `road_type`;
CREATE TABLE `road_type` (
  `road_type_id` int NOT NULL,
  `road_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `road_type` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: sapn_arrangment
-- ----------------------------
DROP TABLE IF EXISTS `sapn_arrangment`;
CREATE TABLE `sapn_arrangment` (
  `sp_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `span_material` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `span_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `span_length` float(10,4) NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: schedule_adhoc_inspecion
-- ----------------------------
DROP TABLE IF EXISTS `schedule_adhoc_inspecion`;
CREATE TABLE `schedule_adhoc_inspecion` (
  `adhoc_inspecion_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `adhoc_inspecion_date` date NOT NULL,
  `comment` text COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','InActive') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: schedule_inspecion
-- ----------------------------
DROP TABLE IF EXISTS `schedule_inspecion`;
CREATE TABLE `schedule_inspecion` (
  `si_id` int NOT NULL AUTO_INCREMENT,
  `bridge_id` int NOT NULL,
  `pre_month` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `post_month` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  `routine_inspecion_month` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `routine_inspecion_frequency` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','InActive') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL,
  PRIMARY KEY (`si_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: schedule_inspecion_notification
-- ----------------------------
DROP TABLE IF EXISTS `schedule_inspecion_notification`;
CREATE TABLE `schedule_inspecion_notification` (
  `notification_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `si_id` int NOT NULL COMMENT 'schedule_inspecion id',
  `adhoc_inspecion_id` int NOT NULL COMMENT 'schedule_adhoc_inspecion id',
  `inspecion_type` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `reminder_date` date NOT NULL,
  `status` enum('Pending','Read') COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: state
-- ----------------------------
DROP TABLE IF EXISTS `state`;
CREATE TABLE `state` (
  `state_id` int NOT NULL,
  `state_name` varchar(100) NOT NULL,
  `state_code` varchar(256) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- ----------------------------
-- Table: state_bkp
-- ----------------------------
DROP TABLE IF EXISTS `state_bkp`;
CREATE TABLE `state_bkp` (
  `state_id` int NOT NULL,
  `state_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `state_code` varchar(256) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: structural_crossing_feature
-- ----------------------------
DROP TABLE IF EXISTS `structural_crossing_feature`;
CREATE TABLE `structural_crossing_feature` (
  `cf_id` int NOT NULL,
  `structural_crossing_feature_code` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `structural_crossing_feature_description` varchar(255) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: structural_form
-- ----------------------------
DROP TABLE IF EXISTS `structural_form`;
CREATE TABLE `structural_form` (
  `sf_id` int NOT NULL,
  `structural_form_code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `structural_form_description` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: structural_form_bkp
-- ----------------------------
DROP TABLE IF EXISTS `structural_form_bkp`;
CREATE TABLE `structural_form_bkp` (
  `sf_id` int NOT NULL,
  `structural_form_code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `structural_form_description` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: structural_rating
-- ----------------------------
DROP TABLE IF EXISTS `structural_rating`;
CREATE TABLE `structural_rating` (
  `structural_rating_id` int NOT NULL,
  `structural_rating_code` int NOT NULL,
  `structural_rating_title` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `structural_rating_desc` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: structure_data_bridge
-- ----------------------------
DROP TABLE IF EXISTS `structure_data_bridge`;
CREATE TABLE `structure_data_bridge` (
  `structure_data_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `design_discharge_in_cumecs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `design_hfl_and_lwl` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `design_scour_level_at_pier` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `design_scour_level_at_abutment` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `founding_strata` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `water_body_lowest_level` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `whether_the_bridge_is_in_grade` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `road_formation_level` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `ground_level` float(10,4) NOT NULL,
  `deck_soft_level_of_superstructure` float(10,4) NOT NULL,
  `clear_carriageway_width` float(10,4) NOT NULL,
  `overall_deck_width` float(10,4) NOT NULL,
  `roadway_width_for_approaches` float(10,4) NOT NULL,
  `safety_kerb_width` float(10,4) NOT NULL,
  `footpath_width` float(10,4) NOT NULL,
  `bridge_railing_type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_railing_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `bridge_railing_width` float(10,4) NOT NULL,
  `whether_median_if_yes_its_width` float(10,4) NOT NULL,
  `shoulder_width` float(10,4) NOT NULL,
  `shoulder_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `height_of_approach_embankment` float(10,4) NOT NULL,
  `average_skew` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL,
  `whether_navigable` enum('No','Yes') COLLATE utf8mb4_general_ci NOT NULL,
  `horizontal_clearance` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `vertical_clearence` float(10,4) NOT NULL,
  `hign_level_submersible_causeway` enum('High-Level','Submersible','Causeway') COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: substructure
-- ----------------------------
DROP TABLE IF EXISTS `substructure`;
CREATE TABLE `substructure` (
  `substructure_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `type_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `substructure_material_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `substructure_material_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `substructure_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition_distress_length` float(10,2) NOT NULL,
  `condition_distress_width` float(10,2) NOT NULL,
  `condition_distress_depth` float(10,2) NOT NULL,
  `distance_distress_x` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `distance_distress_y` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `efficiency_drainage_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `efficiency_drainage_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_abutment_found_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_abutment_found_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `efficiency_drainage_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `efficiency_drainage_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_abutment_found_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_abutment_found_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `condition_a1_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `condition_a2_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: substructure_bridge
-- ----------------------------
DROP TABLE IF EXISTS `substructure_bridge`;
CREATE TABLE `substructure_bridge` (
  `substructure_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `type_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `substructure_material_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `substructure_material_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_abutment_found_a1` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_abutment_found_a2` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: substructure_piers_bridge
-- ----------------------------
DROP TABLE IF EXISTS `substructure_piers_bridge`;
CREATE TABLE `substructure_piers_bridge` (
  `p_id` int NOT NULL,
  `substructure_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `substructure_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `efficiency_of_drainage` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_of_abutment_foundation` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `piler_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: substructure_pilers
-- ----------------------------
DROP TABLE IF EXISTS `substructure_pilers`;
CREATE TABLE `substructure_pilers` (
  `p_id` int NOT NULL,
  `substructure_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `type` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `substructure_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `condition` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `efficiency_of_drainage` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `max_depth_of_abutment_foundation` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `piler_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `piler_images` text COLLATE utf8mb4_general_ci,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: subways
-- ----------------------------
DROP TABLE IF EXISTS `subways`;
CREATE TABLE `subways` (
  `subway_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `check_condition_of_side_retaining_wall` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_condition_of_side_retaining_wall_image` text COLLATE utf8mb4_general_ci,
  `check_condition_of_side_retaining_wall_distress_length` float(10,2) NOT NULL DEFAULT '0.00',
  `check_condition_of_side_retaining_wall_distress_width` float(10,2) NOT NULL DEFAULT '0.00',
  `check_condition_of_side_retaining_wall_distress_depth` float(10,2) NOT NULL DEFAULT '0.00',
  `check_large_excavations_done` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_large_excavations_done_image` text COLLATE utf8mb4_general_ci,
  `check_large_excavations_done_distress_length` float(10,2) NOT NULL DEFAULT '0.00',
  `check_large_excavations_done_distress_width` float(10,2) NOT NULL DEFAULT '0.00',
  `check_large_excavations_done_distress_depth` float(10,2) NOT NULL DEFAULT '0.00',
  `check_damages_to_protective_measures` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_damages_to_protective_measures_image` text COLLATE utf8mb4_general_ci,
  `check_damages_to_protective_measures_distress_length` float(10,2) NOT NULL DEFAULT '0.00',
  `check_damages_to_protective_measures_distress_width` float(10,2) NOT NULL DEFAULT '0.00',
  `check_damages_to_protective_measures_distress_depth` float(10,2) NOT NULL DEFAULT '0.00',
  `check_damage_to_protective_coating_or_paint` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_damage_to_protective_coating_or_paint_image` text COLLATE utf8mb4_general_ci,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: superstructure
-- ----------------------------
DROP TABLE IF EXISTS `superstructure`;
CREATE TABLE `superstructure` (
  `superstructure_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `name_of_span` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `type_of_span` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `no_of_girder` int DEFAULT NULL,
  `structural_system` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_of_material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_spalling_disintegration_or_honey_combing` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `superstructure_name` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_cracks` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_exposed_reinforcement` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_wear_of_deck_surface` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_scaling` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_surface_stains_and_rust_stains` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_leaching` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_corrosion_of_reinforcements` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_leakage` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_damages_due_to_moving_vehicles` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_condition_of_articulation` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_excessive_vibrations` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_excessive_deflections_loss_of_camber` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_cracks_around_anchorage_zone` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_excessive_deflections_at_central_hinge` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `in_box_girders` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_accumulation_of_slit` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_peeling_off` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_steel_members` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_condition_of_protective_system` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_corrosion_if_any` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_excessive_vibrations_if_any` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_alignment_of_members` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_condition_for_steel_superstructure` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_excessive_loss_of_camber` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_buckling_kinking_warping_and_waviness` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_apparent_fracture` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_excessive_wear` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_conditions_inside_the_closed_members` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_masonry_arches` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_condition_of_joints_mortar` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_profile_report_flattening` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_cracks_indicate_location_etc` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_drainage_of_spandrel_fillings` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_spalling_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_exposed_reinforcement_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_cracks_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_wear_of_deck_surface_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_scaling_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_surface_stains_and_rust_stains_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_leaching_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_corrosion_of_reinforcements_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_leakage_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_damages_due_to_moving_vehicles_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_condition_of_articulation_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_excessive_vibrations_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_excessive_deflections_loss_of_camber_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_excessive_deflections_at_central_hinge_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_cracks_around_anchorage_zone_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_accumulation_of_slit_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `in_box_girders_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_peeling_off_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_steel_members_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_condition_of_protective_system_images` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_corrosion_if_any_images` text COLLATE utf8mb4_general_ci,
  `check_excessive_vibrations_if_any_images` text COLLATE utf8mb4_general_ci,
  `check_alignment_of_members_images` text COLLATE utf8mb4_general_ci,
  `check_condition_for_steel_superstructure_images` text COLLATE utf8mb4_general_ci,
  `check_buckling_kinking_warping_and_waviness_images` text COLLATE utf8mb4_general_ci,
  `check_excessive_wear_images` text COLLATE utf8mb4_general_ci,
  `check_apparent_fracture_images` text COLLATE utf8mb4_general_ci,
  `check_conditions_inside_the_closed_members_images` text COLLATE utf8mb4_general_ci,
  `check_masonry_arches_images` text COLLATE utf8mb4_general_ci,
  `check_condition_of_joints_mortar_images` text COLLATE utf8mb4_general_ci,
  `check_profile_report_flattening_images` text COLLATE utf8mb4_general_ci,
  `check_cracks_indicate_location_etc_images` text COLLATE utf8mb4_general_ci,
  `check_drainage_of_spandrel_fillings_images` text COLLATE utf8mb4_general_ci,
  `check_excessive_loss_of_camber_images` text COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: superstructure_bridge
-- ----------------------------
DROP TABLE IF EXISTS `superstructure_bridge`;
CREATE TABLE `superstructure_bridge` (
  `superstructure_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `reinforced_concrete_and_prestressed_concrete_members` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_steel_members` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: superstructure_no_of_girders
-- ----------------------------
DROP TABLE IF EXISTS `superstructure_no_of_girders`;
CREATE TABLE `superstructure_no_of_girders` (
  `sg_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `superstructure_id` int NOT NULL,
  `girder_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `condition_of_girder` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `girder_length` float(10,4) NOT NULL,
  `girder_width` float(10,4) NOT NULL,
  `girder_depth` float(10,4) NOT NULL,
  `girder_distance_x` float(10,4) NOT NULL,
  `girder_distance_y` float(10,4) NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: traffic_lane_on_bridge
-- ----------------------------
DROP TABLE IF EXISTS `traffic_lane_on_bridge`;
CREATE TABLE `traffic_lane_on_bridge` (
  `traffic_lane_id` int NOT NULL,
  `traffic_lane_code` int NOT NULL,
  `traffic_lane_desc` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: type_of_bridge
-- ----------------------------
DROP TABLE IF EXISTS `type_of_bridge`;
CREATE TABLE `type_of_bridge` (
  `type_of_bridge_id` int NOT NULL,
  `type_of_bridge_code` varchar(250) COLLATE utf8mb4_general_ci NOT NULL,
  `type_of_bridge` varchar(250) COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `uid` int NOT NULL,
  `username` varchar(50) NOT NULL,
  `pass` varchar(100) NOT NULL,
  `first_name` varchar(20) NOT NULL,
  `last_name` varchar(20) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone_number` varchar(12) NOT NULL,
  `address` tinytext NOT NULL,
  `state_id` int NOT NULL,
  `user_role` enum('Admin','BMC','Sales','Purchase','QC','Logistics','Accounts','Stores','Super Admin') NOT NULL,
  `user_status` enum('Active','In-Active') NOT NULL DEFAULT 'Active',
  `sign` varchar(200) NOT NULL
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

-- ----------------------------
-- Table: utilities
-- ----------------------------
DROP TABLE IF EXISTS `utilities`;
CREATE TABLE `utilities` (
  `utilities_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `present_lhs` enum('Yes','No') COLLATE utf8mb4_general_ci NOT NULL,
  `present_rhs` enum('Yes','No') COLLATE utf8mb4_general_ci NOT NULL,
  `type_of_utility_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `type_of_utility_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_damage_due_to_utility_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_damage_due_to_utility_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `distress_length` float(10,2) NOT NULL,
  `distress_width` float(10,2) NOT NULL,
  `distress_depth` float(10,2) NOT NULL,
  `any_type_of_encroachment_lhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `any_type_of_encroachment_rhs` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `report_damage_due_to_utility_images` text COLLATE utf8mb4_general_ci,
  `any_type_of_encroachment_images` text COLLATE utf8mb4_general_ci,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: waterway
-- ----------------------------
DROP TABLE IF EXISTS `waterway`;
CREATE TABLE `waterway` (
  `waterway_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `check_presence_of_obstruction_in_flow` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `check_presence_of_obstruction_in_flow_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `flow_pattern` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `flow_pattern_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `maximum_flood_level_observed_during_the_year` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `maximum_flood_level_observed_during_the_year_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `afflux_from_us_and_ds` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `afflux_from_us_and_ds_image` varchar(256) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('Pending','Completed') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: wearing_coat
-- ----------------------------
DROP TABLE IF EXISTS `wearing_coat`;
CREATE TABLE `wearing_coat` (
  `wearing_coat_id` int NOT NULL,
  `bridge_inspection_id` int NOT NULL,
  `material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `surface_condition` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `surface_condition_distress_length` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `surface_condition_distress_width` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `surface_condition_distress_depth` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `details_of_water_proofing_system` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `surface_condition_images` text COLLATE utf8mb4_general_ci,
  `details_of_water_proofing_system_images` text COLLATE utf8mb4_general_ci,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_on` date NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: wearing_coat_bridge
-- ----------------------------
DROP TABLE IF EXISTS `wearing_coat_bridge`;
CREATE TABLE `wearing_coat_bridge` (
  `wearing_coat_bridge_id` int NOT NULL,
  `bridge_id` int NOT NULL,
  `material` varchar(256) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Active','In-Active') COLLATE utf8mb4_general_ci NOT NULL,
  `updated_by` int NOT NULL,
  `updated_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ----------------------------
-- Table: zone
-- ----------------------------
DROP TABLE IF EXISTS `zone`;
CREATE TABLE `zone` (
  `zone_id` int NOT NULL,
  `zone_code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `zone_name` text COLLATE utf8mb4_general_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS=1;
