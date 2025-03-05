import { ItemId } from "wikibase-sdk";
import { Claim, createClaim, createReference, editClaim, getClaims, RemoveClaim, updateClaim, updateReference } from "../../lib/wikidata";
import wikidataConfig from "../../config/wikidata";
import { prisma } from '../../lib/prisma'
import { emissionsService } from "./emissionsService";
import { Emissions } from "@prisma/client";

const {
  CARBON_FOOTPRINT,
  START_TIME,
  END_TIME,
  OBJECT_OF_STATEMENT_HAS_ROLE,
  APPLIES_TO_PART
} = wikidataConfig.properties;

class WikidataService {
  async updateWikidata(wikidataId: `Q${number}`) {
    let claims: Claim[] = [];
    const emissions: Emissions = await emissionsService.getLatestEmissionsAndMetadataByWikidataId(wikidataId)
    const startDate = emissions.reportingPeriod.startDate
    const endDate = emissions.reportingPeriod.endDate
    const reportURL = emissions.reportingPeriodId.reportURL

    if (!startDate || !endDate) return

    if(
      emissions.scope1?.metadata.verifiedBy &&
      emissions.scope1?.total
    ) {
      claims.push({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          value: emissions.scope1.total!.toString(),
          referenceUrl: reportURL!,
          scope: wikidataConfig.entities.SCOPE_1
      })
    }

    if(emissions.scope2?.metadata.verifiedBy) {
        if(emissions.scope2.mb) {
            claims.push({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                value: emissions.scope2.mb!.toString(),
                referenceUrl: reportURL!,
                scope: wikidataConfig.entities.SCOPE_2_MARKET_BASED
            }) 
        }

        if(emissions.scope2.lb) {
            claims.push({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                value: emissions.scope2.lb!.toString(),
                referenceUrl: reportURL!,
                scope: wikidataConfig.entities.SCOPE_2_LOCATION_BASED
            })
        }

        if(emissions.scope2.unknown) {
            claims.push({
                startDate: emissions!.scope2.reportingPeriod!.startDate.toISOString(),
                endDate: emissions!.scope2.reportingPeriod!.endDate.toISOString(),
                value: emissions.scope2.unknown!.toString(),
                referenceUrl: emissions!.scope2.reportingPeriod!.reportURL!,
                scope: wikidataConfig.entities.SCOPE_2
            })
        }
    }

    for(const category of emissions.scope3.categories) {
        if(category.metadata.verifiedBy && category && category.total && category.category !== 16) {
            claims.push({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                value: category.total.toString(),
                referenceUrl: reportURL!,
                scope: wikidataConfig.entities.SCOPE_3,
                category: wikidataConfig.translateIdToCategory(category.category)
            })
        }
    }
    await wikidataService.bulkCreateOrEditCarbonFootprintClaim(wikidataId, claims);
    return
  }

  async findCarbonFootprintClaim(entity: ItemId, startDate: string, endDate: string, scope?: string, category?: string): Promise<{guid: string, referenceHash?: string}|undefined> {
    
    const {entities} = await getClaims(entity);
  
    if(entities[entity].claims !== undefined && entities[entity].claims[CARBON_FOOTPRINT] !== undefined) {
        const propertyClaims = entities[entity].claims[CARBON_FOOTPRINT];
        for(const claim of propertyClaims) {
            const qualifiers = claim.qualifiers;    
            if(qualifiers[START_TIME] === undefined || qualifiers[START_TIME][0].datavalue.value.time !== startDate) {
                continue;
            }
            if(qualifiers[END_TIME] === undefined || qualifiers[END_TIME][0].datavalue.value.time !== endDate) {
                continue;
            }
            
            if( (scope === undefined && qualifiers[OBJECT_OF_STATEMENT_HAS_ROLE] !== undefined) ||
                (scope !== undefined && (qualifiers[OBJECT_OF_STATEMENT_HAS_ROLE] === undefined || qualifiers[OBJECT_OF_STATEMENT_HAS_ROLE][0].datavalue.value.id !== scope))) {
                continue;
            }
            if( (category === undefined && qualifiers[APPLIES_TO_PART] !== undefined) ||
                (category !== undefined && (qualifiers[APPLIES_TO_PART] === undefined || qualifiers[APPLIES_TO_PART][0].datavalue.value.id !== category))) {
                continue;
            }
            if(claim.references !== undefined && claim.references.length > 0) {
              return {guid: claim.id, referenceHash: claim.references[0].hash};
            } else {
              return {guid: claim.id};
            }            
        }
    } 
  
    return undefined;
  }

  compareClaims(newClaim, wikidataClaim) { 
    const qualifiers = wikidataClaim.qualifiers; 
    if( (newClaim.scope === undefined && qualifiers[OBJECT_OF_STATEMENT_HAS_ROLE] !== undefined) ||
        (newClaim.scope !== undefined && (qualifiers[OBJECT_OF_STATEMENT_HAS_ROLE] === undefined || qualifiers[OBJECT_OF_STATEMENT_HAS_ROLE][0].datavalue.value.id !== newClaim.scope))) {
        return false;
    }
    if( (newClaim.category === undefined && qualifiers[APPLIES_TO_PART] !== undefined) ||
        (newClaim.category !== undefined && (qualifiers[APPLIES_TO_PART] === undefined || qualifiers[APPLIES_TO_PART][0].datavalue.value.id !== newClaim.category))) {
        return false;
    }
    return true;
  }
  /**
   * Calculates the claims to add and which to remove in order to update the entity
   * @param entity Entity for which the exisiting and adding Claims should be compared
   * @param claims The claims to add
   * @returns 
   */
  async diffCarbonFootprintClaims(entity: ItemId, claims: Claim[]) {
    const {entities} = await getClaims(entity);
    const newClaims: Claim[] = [];
    const rmClaims: RemoveClaim[] = [];
    
    const existingClaims = entities[entity].claims ? entities[entity].claims[CARBON_FOOTPRINT] ?? [] : [];

    for(const claim of claims) {
      let duplicate = false;
      for(const existingClaim of existingClaims) {
        /**
         * Bit of explanaiton for the different cases
         * The compareClaim function looks if there is already a claim with the same scope and optional category
         * If that is the case we only want the most recent claim of that scope and category to be on wikidata
         * Therefore, we look at the end date of the claim's reporting period to find the most recent one
         * All older claims will not be added or are removed if there are on wikidata 
         */
        if(this.compareClaims(claim, existingClaim)) {
          if(existingClaim.qualifiers[END_TIME] === undefined 
            || this.transformFromWikidataDateString(existingClaim.qualifiers[END_TIME][0].datavalue.value.time).getTime() < (new Date(claim.endDate)).getTime()) {
              rmClaims.push({id: existingClaim.id, remove: true}); //Remove older claims;
              continue;
          } else if(existingClaim.qualifiers[END_TIME] !== undefined 
            && this.transformFromWikidataDateString(existingClaim.qualifiers[END_TIME][0].datavalue.value.time).getTime() > (new Date(claim.endDate)).getTime()) {
              duplicate = true; //If there is a more recent one do not add that claim
          } else if(existingClaim.qualifiers[END_TIME] !== undefined && existingClaim.qualifiers[START_TIME] !== undefined 
            && this.transformFromWikidataDateString(existingClaim.qualifiers[END_TIME][0].datavalue.value.time).getTime() === (new Date(claim.endDate)).getTime()
            && this.transformFromWikidataDateString(existingClaim.qualifiers[START_TIME][0].datavalue.value.time).getTime() === (new Date(claim.startDate)).getTime()) {
            if(("+" + claim.value) !== existingClaim.mainsnak.datavalue.value.amount) {
              newClaims.push(claim); //Update value by removing old claim and adding new claim
              rmClaims.push({id: existingClaim.id, remove: true});
            }          
            duplicate = true;
          } else {
            newClaims.push(claim); //if for some reason the start times differ we still opt for our claim
            rmClaims.push({id: existingClaim.id, remove: true});
            duplicate = true;
          }          
        }      
      }
      if(!duplicate) {
        newClaims.push(claim); //only add claims that not exist already
      }
    }

    console.log(rmClaims);
    console.log(newClaims);
    return {newClaims, rmClaims};
  }

  async bulkCreateOrEditCarbonFootprintClaim(entity: ItemId, claims: Claim[]) {
    const {newClaims, rmClaims} = await this.diffCarbonFootprintClaims(entity, claims);  
    await editClaim(entity, newClaims, rmClaims);
  }

  async createOrEditCarbonFootprintClaim(entity: ItemId, startDate: Date, endDate: Date, value: string, referenceUrl: string, scope?: ItemId, category?: ItemId) {
    if(scope === undefined && category !== undefined) {
        throw new Error("Cannot have a category without a scope");
    }  
    const claim = await this.findCarbonFootprintClaim(entity, this.transformToWikidataDateString(startDate), this.transformToWikidataDateString(endDate),
    scope, category);
    if(claim !== undefined) {
        const {guid, referenceHash} = claim;
      	await updateClaim(guid, value);
        if(referenceHash !== undefined) {
          await updateReference(guid, referenceUrl, referenceHash)
        } else {
          await createReference(guid, referenceUrl)
        }
    } else {
        await createClaim(entity, startDate.toISOString(), endDate.toISOString(), value, referenceUrl, scope, category);
    }
  }
  
  transformToWikidataDateString(date: Date) {
    return "+" + date.toISOString().substring(0, 19) + "Z";
  }

  transformFromWikidataDateString(date: string) {
    return new Date(date.substring(1));
  }
}

export const wikidataService = new WikidataService()
