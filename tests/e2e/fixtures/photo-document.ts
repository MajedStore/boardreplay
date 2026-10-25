import type { LectureDocument, LectureImage, PhotoOrganization } from "../../../lib/types";

/** Authored software fixtures only; no AI accuracy or model findings are implied. */
export function documentFixture(images: LectureImage[], order = images.map((image) => image.id)): LectureDocument {
  const organization: PhotoOrganization = {
    version: 1, mode: "AUTOMATIC",
    sequences: [{ id: "fixture-sequence", title: "Üniversite dersi", orderingConfidence: "MEDIUM", uncertainty: "Yazılım testi: önerilen sıralama görsel doğruluk kanıtı değildir.", states: order.map((id, index) => ({ id: `state-${index}`, imageIds: [id], primaryImageId: id, reason: "Authored browser fixture.", confidence: "MEDIUM" })) }],
    duplicateGroups: [], relationships: [], warnings: [],
  };
  return {
    schemaVersion: 1, title: "Diferansiyel denklemler ve teknik notlar", overview: "Fotoğrafların altında bağlama bağlı açıklamalar. Bu içerik açıkça yazılım testi için hazırlanmıştır.", language: "Türkçe", organization, unresolved: [],
    photos: order.map((imageId, index) => {
      const image = images.find((candidate) => candidate.id === imageId)!;
      return { id: `photo-explanation-${imageId}`, imageId, sequenceId: "fixture-sequence", heading: index ? "Çözümün devamı" : "Tam diferansiyel denklemler", bodyMarkdown: index ? `Önceki fotoğraftaki ifadeye ${index + 1}. adımdaki yeni bilgi eklenir. Bu açıklama yalnızca bu fotoğrafın katkısını ele alır.` : "Bu fotoğrafta tam diferansiyel denklem inceleniyor. Görünen eşitlik için $P_y=Q_x$ koşulu araştırılır.\n\n$$\n\\frac{\\partial P}{\\partial y}=\\frac{\\partial Q}{\\partial x}\n$$\n\nBu eşitlik görünen türevlerin ilişkisini açıklar; okunamayan ara adımlar uydurulmaz.", relation: index ? "CONTINUATION" : "INITIAL", evidenceStatus: "DERIVED", uncertainty: null, sourceImageIds: [imageId], rotation: image.rotation, imageAspectRatio: image.rotation === 90 || image.rotation === 270 ? image.height / image.width : image.width / image.height };
    }),
  };
}
