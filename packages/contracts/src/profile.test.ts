import { expect, it } from "vitest";
import { cvExtractionSchema } from "./profile.js";
it("normalizes missing facts without inventing them and preserves professional detail",()=>{
 const result=cvExtractionSchema.parse({profile:{education:[{institution:"Example University",start_date:"2023"}],experience:[{description:"Built a system serving 1500 clients.",highlights:["Reduced response time by 25%."]}]}});
 expect(result.profile.personal.email).toBeNull();expect(result.profile.languages).toEqual([]);expect(result.profile.education[0]?.start_date).toBe("2023");
 expect(result.profile.experience[0]?.description).toBe("Built a system serving 1500 clients.");
 expect(cvExtractionSchema.safeParse({profile:{education:[{start_date:"yesterday"}]}}).success).toBe(false);
});
