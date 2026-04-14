/** Rating description tables (from PHP $config and define('BRIDGE_RATING')) */

export const ratingDescriptions = {
  impact: {
    1: 'No Symptoms and the age of the structure is below one year or Tracks of mechanical impacts are evident',
    2: 'Local damage of a concrete cover or Spalling of concrete edges Blows from the car tires across Expansion Joints',
    3: 'Punching failure and excessive Spalling of concrete, single cracks, excessive deformations of longitudinal reinforcement bars or stirrups in the zone of impact',
    4: 'Destruction of structures and dangerous defects (rupture of main reinforcement, crushing of concrete, excessive deflections or displacements of the structure) leading to global failure of structural members and as a result closure of traffic',
    5: 'Section Failed / Core Damage is Seen',
  },
  abrasion: {
    1: 'No Symptoms and the age of the structure is below  one year or the studded tire wear are evident (rubbing, scraping,skidding, or sliding of objects on its surface)',
    2: 'Loss of surface material due to external loads and Visibility of fine Aggregates are evident',
    3: 'The fine and coarse aggregate are exposed and Loss of bond between aggregates to cement paste',
    4: 'Changes to the depth of cement paste or height of aggregate and Extensive Detachment of concrete',
    5: 'Section Failed / Core Damage is Seen',
  },
  erosion: {
    1: 'No Symptoms and the age of the structure is below  one year or Top most productive layer of soil is stripped by the action of raindrops and surface flows. Low velocity of water flow for cavitation',
    2: 'The softened concrete surface, weakened by dissolved water minerals leaching components of hydrated cement paste, is highly vulnerable to removal by water flow, with or without suspended particles. This effect is particularly observed on piers, piles, and abutments immersed in river water. Discontinuities or irregularities in the high-velocity flow path further contribute to cavitation, lifting off the surface material and accelerating deterioration.',
    3: 'Abrasion from solid particles erodes the concrete surfaces of piles, abutments, and piers at bed level in rivers with high bed loads, leading to particle removal and increased cavitation damage. Additionally, freeze-thaw cycles gradually strip surface mortar and aggregates from wing walls and curbs, further contributing to concrete deterioration and cavitation.',
    4: 'Fast-flowing water in streams or creeks causes soil erosion and cavitation beyond the cover. Salt scaling from crystallization penetrates several millimeters into the concrete, leaving distinctive white deposits and extensive cavitation damage.',
    5: 'Section Failed / Soil has been washed away due to fast-flow and resulting in the banks of the waterway becoming unstable and useless. Cavitation damages core concrete',
  },
  overload: {
    1: 'No Symptoms and the age of the structure is below one year or Evident of Hairline cracks at lower surface of the concrete',
    2: 'Flexural Cracking on the lower surface of the concrete and sagging of concrete is evident and Hairline cracks at lower surface of the concrete',
    3: 'Deformation of concrete is observed and Development of vertical cracks at the bottom of the beam/slab/Girder etc. and Crushing of concrete at top surface and sagging of concrete observed',
    4: 'Extensive Spalling of concrete and exposed reinforcement observed and permanent deformation observed',
    5: 'Secion Failed / Core Damage is Seen',
  },
  fatigue: {
    1: 'No Symptoms and the age of the structure is below one year or Stabled micro-cracks observed ',
    2: 'Moderate or Unstable micro cracks observed',
    3: 'Cracks have progressed from moderate to extensive with signs of corrosion, deformation is pronounced and vibrations are visible without any instruments',
    4: 'Cracks have progressed to extensive Spalling of the concrete, Reinforcement damage and deformation have resulted in more cracks and vibrations are noticed during any movement of vehicles',
    5: 'Secion Failed / Core Damage is Seen, concrete section is visible to approach failure.',
  },
  temprature: {
    1: 'No Symptoms and the age of the structure is below  one year or Negligible effect or damage on the pore system or microstructure of concrete. There is no change in colour',
    2: 'Significant cracking of both the cementitious paste and aggregates due to expansion, along with localized cracks and dehydration, leads to a reduction in paste volume and the complete loss of free moisture. The concrete’s color changes to pink.',
    3: 'Complete dehydration of the cementitious paste leads to significant shrinkage cracking and honeycombing, making the concrete friable, highly porous, and easily broken down. The concrete loses strength and changes color to grey.',
    4: 'Colour of concrete changes to buff and various components of concrete start to melt.',
    5: 'Section Failed or Concrete melts completely',
  },
  shrinkage: {
    1: 'No Symptoms and the age of the structure is below  one year or Discontinuous hairline Cracks (below 1 mm) are evident (the crack "stops and starts" in the same area)',
    2: 'Hairline cracks are extend through the entire thickness of the slab (1 mm) or Cracks that run to the mid-depth of the concrete, are distributed across the surface unevenly, and are usually short in length (Below 1 mm)',
    3: 'Cracks (1 - 2 mm)  form throughout the section to allow the reduction in volume (Dry Shrinkage) and Surface crazing (alligator pattern) on walls and slabs on a small scale. a series of shallow, closely spaced, fine cracks (1 mm) (example of drying shrinkage)',
    4: 'Detachment of Concrete and Delamination starts and Cracks (2 mm)  are widen throughout the section',
    5: 'Core Damage or Extensive  Detachment of Concrete and Delamination starts',
  },
  settlement: {
    1: 'No visual distress or deterioration observed or Negligible effect or damage on the core system or microstructure of concrete.',
    2: 'Characterised micro cracking of all sides of the structural members near to settlement area.',
    3: 'Significant wide cracks near to settlement area in structural component and Spalling observed in the structural component',
    4: 'Cracks are observed in the core, with significant cracking in the support framing, leading to rider discomfort. Delamination and deflection are also evident in other frame sections.',
    5: 'Section Failed or Concrete section damaged partially',
  },
  carbon_dioxide: {
    1: 'No Symptoms and the age of the structure is below  one year or Present of Micro-cracks are evident (0.25mm- 0.50mm)',
    2: 'Extensive Microcraks more pronounced and parallel to reinforcement (0.50-2mm)',
    3: 'Crack Widening (2-4mm) / Cracks along primary reinforcement is evident / Delamination of Concrete in Primary and Secondary Reinforcement',
    4: 'Extensive Spalling in Primary Reinforcement / Loss of Steel in Secondary Reinforcement, Extensive Delamination, Loss of Section in Rebar / Discontinuity',
    5: 'Section Failed or Core damage is seen',
  },
  sulphates: {
    1: 'No Symptoms and the age of the structure is below  one year or Cracking in surface concrete (0.1- 0.5mm)',
    2: 'Symptoms previously observed become more evident and pronounced (1-4 mm), with extensive crack formation (0.5-1 mm) and noticeable volume increase in the affected concrete. The damage is more pronounced near the ground in cases of groundwater attack.',
    3: 'Increases in volume and Excessive Delamination, swelling, cracking and detachment of Concrete',
    4: 'Delamination of the swelled section exposes the core, showing signs of sulfate attack. As the surface concrete detaches from the core, the risk of cover collapse becomes evident.',
    5: 'Section Failed or Core damage is seen or Core also gets Damaged and starts to deteriorate.',
  },
  carbonation: {
    1: 'No Symptoms and the age of the structure is below  one year or Present of Micro-cracks are evident (0.25mm- 0.50mm)',
    2: 'Extensive Microcraks more pronounced and parallel to reinforcement (0.50-2mm)',
    3: 'Crack Widening (2-4mm) / Cracks along primary reinforcement is evident / Delamination of Concrete in Primary and Secondary Reinforcement',
    4: 'Extensive Spalling in Primary Reinforcement / Loss of Steel in Secondary Reinforcement, Extensive Delamination, Loss of Section in Rebar / Discontinuity',
    5: 'Section Failed or Core damage is seen',
  },
  alkali: {
    1: 'No Symptoms and the age of the structure is below  one year or Pattern cracking or alligator cracking’s are evident (below 0.01 mm)',
    2: 'Map-cracking (0.08–0.27 mm) is observed in lightly reinforced large columns and at the ends of cross-beams, while slender columns exhibit vertical cracking, either as a single crack or parallel cracks (0.01–0.08 mm).',
    3: 'Small portions of concrete above reactive silicon aggregates lift, causing a pop-out phenomenon, particularly in industrial floors. Discoloration around cracks (0.27–1 mm) is often observed due to gel exudation in their vicinity.',
    4: 'Increasing of deteriorating, a further percentage of humidity will accelerate the reaction process, with the added risk of deterioration due to freeze-thaw cycles. And Evident to Serious Branch type Cracking',
    5: 'Section Failed or Core damage is seen',
  },
};

const multiline = (s) => s.replace(/\n\s+/g, '\n').trim();

export const componentRatingDesc = {
  superstructure_rating: {
    1: {
      condition: 'Excellent condition',
      description: multiline(`No visible distress/ deterioration observed.
        Only constructional deficiencies may be present. 
        Extent of deficiencies is nil or insignificant. Severity of deficiencies is very low.`),
    },
    2: {
      condition: 'Good condition',
      description: multiline(`0 to 5% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure.
        0 to 1mm visible cracks and 0 to 5% of exposed reinforcement of concrete superstructure.
        1 to 5% of unevenness on concrete Superstructure. 
        No Section loss of superstructure `),
    },
    3: {
      condition: 'Fair condition',
      description: multiline(`5 to 25 % of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure.
        1 to 4mm visible cracks and 5 to 25 % of exposed reinforcement of concrete superstructure.
        5 to 25% of unevenness on concrete Superstructure. 
        0 to 3 % of Section loss of superstructure. `),
    },
    4: {
      condition: 'Poor condition',
      description: multiline(`25 to 40% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure.
        4 to 6mm visible cracks and 25 to 40 % of exposed reinforcement of concrete superstructure.
        25 to 40% of unevenness on concrete Superstructure.
        3 to 5 % of Section loss of superstructure. `),
    },
    5: {
      condition: 'Critical condition',
      description: multiline(`> 40% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Superstructure.
        > 6mm visible cracks and >40 % of exposed reinforcement of concrete superstructure. 
        >40% of unevenness on concrete Superstructure.
        >5 % of Section loss of superstructure. `),
    },
  },
  substructure_rating: {
    1: {
      condition: 'Excellent condition',
      description: multiline(`No visible distress/ deterioration observed.
        Only constructional deficiencies may be present. 
        Extent of deficiencies is nil or insignificant. Severity of deficiencies is very low.`),
    },
    2: {
      condition: 'Good condition',
      description: multiline(`0 to 5% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Substructure.
        0 to 1mm visible cracks and 0 to 5% of exposed reinforcement of concrete Substructure.
        1 to 5% of unevenness on concrete Substructure. 
        No Section loss of Substructure.`),
    },
    3: {
      condition: 'Fair condition',
      description: multiline(`5 to 25 % of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Substructure.
        1 to 4mm visible cracks and 5 to 25 % of exposed reinforcement of concrete Substructure.
        5 to 25% of unevenness on concrete Substructure.
        0 to 3 % of Section loss of Substructure. `),
    },
    4: {
      condition: 'Poor condition',
      description: multiline(`25 to 40% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Substructure.
        4 to 6mm visible cracks and 25 to 40 % of exposed reinforcement of concrete Substructure.
        25 to 40% of unevenness on concrete Substructure.
        3 to 5 % of Section loss of Substructure.`),
    },
    5: {
      condition: 'Critical condition',
      description: multiline(`> 40% of area effect of Honeycombing, Delamination, Spalling, Scaling, corrosion, Efflorescence and Leaching of the total Substructure.
        > 6mm visible cracks and >40 % of exposed reinforcement of concrete Substructure.
        >40% of unevenness on concrete Substructure.
        >5 % of Section loss of Substructure.`),
    },
  },
  foundation_rating: {
    1: {
      condition: 'Excellent condition',
      description:
        'Foundation not visible and surrounded by dense soil, and no visibility of soil erosion',
    },
    2: {
      condition: 'Good Condition',
      description:
        'Footing not visible and surrounded by soil, soil erosion is evident.',
    },
    3: {
      condition: 'Fair condition',
      description: 'Foundation top is visible and erosion is noticeable',
    },
    4: {
      condition: 'Poor condition',
      description:
        'Foundation top and partial Foundation depth is visible due to erosion; Footing bottom/ piles stems are visible',
    },
    5: {
      condition: 'Critical condition',
      description:
        'Complete footing is exposed and piles stems are exposed for a certain length; Bridge Closing is required for immediate R&R of foundation',
    },
  },
  expansion_joint_rating: {
    1: {
      condition: 'Excellent condition',
      description:
        'No Debris accumulation in the joint gaps.No bumping while Riding, No excessive noise from the expansion joints.No locked-in/jammed condition, No corrosion of Steel Members.No damaged to the concrete edge beam, No Damage to the elastomeric units/sealing component.No evidence of leakages from the expansion joints.',
    },
    2: {
      condition: 'Good Condition',
      description:
        'Minor Debris accumulation in the joint gaps.No bumping while Riding, No excessive noise from the expansion joints.No locked-in/jammed condition, No corrosion of Steel Members.Hairline cracks visible on concrete edge beam, No Damage to the elastomeric units/sealing component.No evidence of leakages from the expansion joints.',
    },
    3: {
      condition: 'Fair condition',
      description:
        'Debris accumulation in the joint gaps.Minor bumping while Riding, Minor excessive noise from the expansion joints.No locked-in/jammed condition, Minor corrosion of Steel Members.Minor cracks visible on concrete edge beam, Minor Damage to the elastomeric units/sealing component.Evidence of leakages from the expansion joints.',
    },
    4: {
      condition: 'Poor condition',
      description:
        'Debris/BC accumulation in the joint gaps and over the assembly.Major Bumping while Riding,  Major excessive noise from the expansion joints.Heavy corrosion of Steel Members, Major cracks, Damage, Patches visible on Concrete edge beam.No elastomer seal /sealing component in the joints and major leakages from the expansion joints.',
    },
    5: {
      condition: 'Critical condition',
      description:
        'Damaged anchorage system, Steel studs clearly visible with damage assembly.Major Bumping/Jerk while Riding, Heavy excessive noise from the expansion joints, locked-in/jammed condition.Broken/Corroded Steel Members, Major damage to the concrete edge beam.No elastomer seal /sealing component in the joints and leakages from the expansion joints.',
    },
  },
};

export const bearingRatingDesc = {
  'Rocker & Roller Bearing': {
    1: {
      condition: 'Excellent condition',
      description: multiline(`No uncontrolled movements, correct positioning with adequacy for free movement.
        No Fracture, Cracks or deformation in parts of bearings.
        Condition of anchorage, sliding and rolling surface is Balanced.
        No corrosion on components been found.
        No seizure due to dust or non lubrication been found.`),
    },
    2: {
      condition: 'Good Condition',
      description: multiline(`No uncontrolled movements, correct positioning with adequacy for free movement.
        No Fracture, Cracks or deformation in parts of bearings.
        Condition of anchorage, sliding and rolling surface is Balanced.
        No corrosion on components been found.
        Dust Cleaing and lubrication been required.`),
    },
    3: {
      condition: 'Fair condition',
      description: multiline(`No uncontrolled movements, correct positioning with adequacy for free movement.
        No Fracture, Cracks or deformation in parts of bearings.
        Condition of anchorage, sliding and rolling surface is Balanced.
        Corrosion on components been found.
        Dust Cleaing and lubrication cleaning been required.`),
    },
    4: {
      condition: 'Poor condition',
      description: multiline(`Minor uncontrolled movements, incorrect positioning with minor inadequacy for free movement.
        Minor Fracture, Cracks or deformation found in parts of bearings.
        Condition of anchorage, sliding and rolling surface is partial Balanced.
        Major Corrosion on components been found.
        Dust obstructing the movement and lubrication been found stiff around bearing.`),
    },
    5: {
      condition: 'Critical condition',
      description: multiline(`Major  uncontrolled movements, dislocation from positioning with complete inadequacy for free movement.
        Major Fracture, Cracks or deformation found in parts of bearings.
        Condition of anchorage, sliding and rolling surface is found imbalance/Unstable.
        Major Corrosion on components been found.
        Dust obstructing the movement and lubrication been found stiff around bearing
        Bearing Part is misplace/ dislocate from its original position`),
    },
  },
  'Elastomeric Bearing': {
    1: {
      condition: 'Excellent condition',
      description: multiline(`No visible distress/ deterioration observed on elastomer
        Intact elastomer and embedded steel plates (No shear deflection)
        Top and bottom surface shall be in full contact with Plinth and soffit 
        No Bulging and splitting of the rubber layer. 
        No displacement or deformation of Bearings.`),
    },
    2: {
      condition: 'Good Condition',
      description: multiline(`Hairlane cracks on elastomer (within the acceptable limit <5%).
        Intact elastomer and embedded steel plates (No shear deflection)
        Top and bottom surface shall be in full contact with Plinth and soffit 
        No Bulging and splitting of the rubber layer. 
        No displacement or deformation of Bearings.`),
    },
    3: {
      condition: 'Fair condition',
      description: multiline(`Cracks on elastomer (>5%).
        Minor deteriorated elastomer and embedded steel plates (Minor shear deflection visible)
        Top and bottom surface shall be seen gaps in edges portion of Plinth and soffit 
        Minor Bulging and splitting of the rubber layer. 
        Minor displacement or deformation of Bearings.`),
    },
    4: {
      condition: 'Poor condition',
      description: multiline(`Major Cracks along with bulging observed on elastomer.
        Poor bond at laminate/steel interface and Misalignment of reinforcing plates(Major shear deflection visible)
        Top and bottom surface shall be seen Major gaps in edges portion of Plinth and soffit
        Bulging and splitting of the rubber layer.
        Major Displacement or deformation of Bearings.`),
    },
    5: {
      condition: 'Critical condition',
      description: multiline(`Major Cracks, Tearing and splitting whole on elastomer.
        Separation of elastomer layers or between elastomer and embedded steel plates (Major shear deflection visible)
        Top and bottom surface shall be seen Major gaps in throughout portion of Plinth and soffit
        Bulging and splitting of the rubber layer is visible.
        Complete Displacement or deformation of Bearings.`),
    },
  },
  'Pot/Pin/Metallic Bearing': {
    1: {
      condition: 'Excellent condition',
      description: multiline(`No visible distress/ deterioration observed.
        Gap between top plate and bottom piston is evenly mainatined (>5mm)
        No bearing is found in locked/Jammed condition.
        No corrosion or any part of bearing is found been exposed.
        No damage is been found in adjacent component of Bearings`),
    },
    2: {
      condition: 'Good Condition',
      description: multiline(`No visible distress/ deterioration observed.
        Gap between top plate and bottom piston is evenly mainatined (>5mm)
        No bearing is found in locked/Jammed condition.
        Minor corrosion been found  but none any part of bearing is found been exposed.
        No damage is been found in adjacent component of Bearings.`),
    },
    3: {
      condition: 'Fair condition',
      description: multiline(`Minor visible distress/ deterioration observed.(One or two bolts pop out)
        Gap between top plate and bottom piston is unevenly mainatined in one direction (<5mm in one direction)
        Bearing is found in locked/Jammed condition.
        Minor corrosion been found  but none any part of bearing is found been exposed.
        Minor damage is been found in adjacent component of Bearings.                                     
        Bearing Rubber seal spill out from its position.`),
    },
    4: {
      condition: 'Poor condition',
      description: multiline(`Major visible distress/ deterioration observed.(Bearing bolts found missing)
        Gap between top plate and bottom piston is unevenly mainatined in both direction (<5mm in both  direction).
        Major bearings are found in locked/Jammed condition.
        Heavy corrosion been found  also elastomer part of bearing is found been exposed.
        Major damage is been found in adjacent component of Bearings.               
        Cracks observed in Bearing Pedestal at bottom of bearing/Pedestal top due to non functionality of bearing.However no deformation in bearing been visible.`),
    },
    5: {
      condition: 'Critical condition',
      description: multiline(`Major visible distress/ deterioration observed.(Plates been separated)
        No Gap between top plate and bottom piston is visible ( 0 mm in throughout direction)
        Major bearings are found in locked/Jammed condition.
        Heavy corrosion been found  also elastomer part of bearing is found been exposed and crushed
        Major damage/Cracks is been found in adjacent component of Bearings.`),
    },
  },
  'Spherical and Cylindrical Bearing': {
    1: {
      condition: 'Excellent condition',
      description: multiline(`No visible distress/ deterioration observed.
        Top and bottom component of Bearing are perfectly parallel to each other.
        No bearing is found in locked/Jammed condition.
        No corrosion or any part of bearing is found been exposed.
        No damage is been found in adjacent component of Bearings.`),
    },
    2: {
      condition: 'Good Condition',
      description: multiline(`No visible distress/ deterioration observed.
        Top and bottom component of Bearing are perfectly parallel to each other.
        No bearing is found in locked/Jammed condition.
        Minor corrosion been found  but none any part of bearing is found been exposed.
        No damage is been found in adjacent component of Bearings.  `),
    },
    3: {
      condition: 'Fair condition',
      description: multiline(`Minor visible distress/ deterioration observed.(One or two bolts pop out)
        Top and bottom component of Bearing are slightly parallel to each other.
        Few Bearing is found in locked/Jammed condition.
        Minor corrosion been found  but none any part of bearing is found been exposed.
        Minor damage is been found in adjacent component of Bearings.
        Bearing Rubber seal spill out from its position.`),
    },
    4: {
      condition: 'Poor condition',
      description: multiline(`Major visible distress/ deterioration observed.(Bearing bolts found missing).
        Top and bottom component of Bearing are tilted and inclined to each other.
        Major bearings are found in locked/Jammed condition.
        Heavy corrosion been found  also elastomer part of bearing is found been exposed.
        Major damage is been found in adjacent component of Bearings.        
        Cracks observed in Bearing Pedestal at bottom of bearing/Pedestal top due to non functionality of bearing.However no deformation in bearing been visible.`),
    },
    5: {
      condition: 'Critical condition',
      description: multiline(`Major visible distress/ deterioration observed.(Plates been separated)
        No gap been found between Top and bottom component of Bearing.
        Major bearings are found in locked/Jammed condition.
        Heavy corrosion been found  also elastomer part of bearing is found been exposed and crushed.
        Major damage/Cracks is been found in adjacent component of Bearings.`),
    },
  },
};

/** Legacy $config['Bridge_Rating'] style summary */
export const bridgeRatingLegacy = {
  overall_bridge_rating: {
    1: {
      condition: 'Excellent condition',
      description: multiline(`No visible distress/ deterioration observed.
        Only constructional deficiencies may be present. 
        Extent of deficiencies is nil or insignificant. Severity of deficiencies is very low.`),
    },
    2: {
      condition: 'Good Condition',
      description: multiline(`Extent of deficiencies is minor; Severity of deficiencies is low. 
        0 to 5 % of area effected by any of the following: Honeycombing, Delamination, Spalling, minor/medium cracks, exposed reinforcement.   
        0 to 1mm visible cracks.  
        1 to 5% unevenness on concrete Superstructure. 
        No Section loss of superstructure. 
        Unevenness due to wear & tear, no potholes on concrete surface. 
        Drainage spouts are functional.`),
    },
    3: {
      condition: 'Fair condition',
      description: multiline(`Extent of deficiencies is major; Severity of deficiencies is medium. 
        5 to 25 % of area effected by any some of the following: Honeycombing, Delamination, Spalling, medium cracks, exposed reinforcement.  
        1 to 4mm visible cracks. 
        0 to 3 % of Section loss of superstructure. 
        Unevenness due to wear & tear, potholes on concrete surface. 
        Drainage spouts are non-functional.`),
    },
    4: {
      condition: 'Poor condition',
      description: multiline(`Extent of deficiencies is large; Severity of deficiencies is high. 
        25 to 40 % of area effected by any of the following: Honeycombing, Delamination, Spalling, major cracks, exposed reinforcement.  
        4 to 6 mm visible cracks and 3 to 5 % of Section loss of superstructure.
        Unevenness due to wear & tear, potholes on concrete surface. 
        Drainage spouts are non-functional.`),
    },
    5: {
      condition: 'Critical condition',
      description: multiline(`Extent of deficiencies is very large / expensive; Severity of deficiencies is very high. 
        >40% of area effected by some of the following:  Honeycombing, Delamination, Spalling, major cracks, exposed reinforcement. 
        >6 mm visible cracks and 
        > 5 % of Section loss of superstructure. 
        Unevenness due to wear & tear, pot holes on concrete surface. 
        Drainage spouts are non-functional. Bride Closed.`),
    },
  },
};

/** Structured bridge rating (PHP define('BRIDGE_RATING')) */
export const BRIDGE_RATING = {
  overall_bridge_rating: {
    1: {
      label: '1 - Excellent',
      details: {
        'Condition:-':
          'Sound structural condition; component do not individually or as a whole impair the strength, stability, traffic safety, durability and serviceability of the structure.',
        'Extent & Severity of Distress:-':
          'Only constructional deficiencies may be present. Extent of deficiencies is nil or insignificant. Severity of deficiencies is very low.',
        'Type of Maintenance:-':
          'No need of repair except routine maintenance.',
      },
    },
    2: {
      label: '2 - Good',
      details: {
        'Condition:-':
          'More than satisfactory structural condition; component do not individually or as a whole impair strength/stability; traffic safety, durability and/or serviceability of the structure might be impaired slightly in the long term.',
        'Extent & Severity of Distress:-':
          'Extent of deficiencies is minor; Severity of deficiencies is low.',
        'Type of Maintenance:-':
          'Specialized maintenance and repairs may be needed at convenience.',
      },
    },
    3: {
      label: '3 - Fair',
      details: {
        'Condition:-':
          'Satisfactory structural condition; strength, stability and traffic safety of the structure is assured however considerable reduction is possible in the long term; serviceability and durability is reduced and durability of the structure might be impaired considerably in the long term.',
        'Extent & Severity of Distress:-':
          'Extent of deficiencies is major; Severity of deficiencies is medium.',
        'Type of Maintenance:-':
          'Specialized maintenance and repairs needed soon.',
      },
    },
    4: {
      label: '4 - Poor',
      details: {
        'Condition:-':
          'Structurally deficient bridge; strength/stability/traffic safety no longer assured; durability may be affected in short term; monitoring is required; restriction of use of the bridge may be needed.',
        'Extent & Severity of Distress:-':
          'Extent of deficiencies is large; Severity of deficiencies is high.',
        'Type of Maintenance:-':
          'Rehabilitation/replacement on program basis is needed; measures for reconstruction or warning signs may be necessary in the short term; detailed investigations and economic analysis required.',
      },
    },
    5: {
      label: '5 - Critical',
      details: {
        'Condition:-':
          'Weak structural condition; partial failure or risk of total failure of the component or as a whole; durability of the structure is no longer ensured; immediate propping and closing may be required.',
        'Extent & Severity of Distress:-':
          'Extent of deficiencies is very large/expensive; Severity of deficiencies is very high.',
        'Type of Maintenance:-':
          'Repair/rehabilitation/replacement is required immediately; design strength, expected serviceability and desired remaining service life can no longer be achieved economically.',
      },
    },
  },
};

/**
 * Mirrors PHP $config['Bridge_Conclusion_Texts'] build from BRIDGE_RATING
 * @returns {Record<number, string>}
 */
export function buildBridgeConclusionTexts(
  bridgeRatingData = BRIDGE_RATING
) {
  const out = {};
  const overall = bridgeRatingData?.overall_bridge_rating;
  if (!overall || typeof overall !== 'object') return out;
  for (const [ratingId, ratingData] of Object.entries(overall)) {
    const details = ratingData?.details;
    if (!details || typeof details !== 'object') continue;
    const parts = Object.entries(details).map(
      ([key, value]) => `${key}\n${String(value).trim()}`
    );
    out[Number(ratingId)] = parts.join('\n\n');
  }
  return out;
}

export const BridgeConclusionTexts = buildBridgeConclusionTexts(BRIDGE_RATING);
