import logging
import time
import json
from pathlib import Path
from typing import Iterable
from docling.datamodel.base_models import ConversionStatus
from docling.datamodel.document import ConversionResult
from docling.datamodel.settings import settings
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.models.tesseract_ocr_model import TesseractOcrOptions
from docling_core.types.doc import TableItem

_log = logging.getLogger(__name__)

def export_documents(
    conv_results: Iterable[ConversionResult],
    output_dir: Path,
):
    output_dir.mkdir(parents=True, exist_ok=True)

    success_count = 0
    failure_count = 0
    partial_success_count = 0

    for conv_res in conv_results:
        if conv_res.status == ConversionStatus.SUCCESS:
            success_count += 1
            doc_filename = conv_res.input.file.stem

            with (output_dir / f"{doc_filename}.json").open("w") as fp:
                json.dump(conv_res.document.export_to_dict(), fp, ensure_ascii=False)
            
            page_images_dir = output_dir / doc_filename / f"pages"
            page_images_dir.mkdir(parents=True, exist_ok=True)
            
            table_images_dir = output_dir / doc_filename / f"tables"
            table_images_dir.mkdir(parents=True, exist_ok=True)

            # Save page images
            for page_no, page in conv_res.document.pages.items():
                page_no = page.page_no
                page_image_filename = page_images_dir / f"{doc_filename}-{page_no}.png"
                with page_image_filename.open("wb") as fp:
                    page.image.pil_image.save(fp, format="PNG")

            # Save images of figures and tables
            table_counter = 0
            for element, _level in conv_res.document.iterate_items():
                if isinstance(element, TableItem):
                    table_counter += 1
                    element_image_filename = (
                        table_images_dir / f"{doc_filename}-table-{table_counter}.png"
                    )
                    with element_image_filename.open("wb") as fp:
                        element.get_image(conv_res.document).save(fp, "PNG")

        elif conv_res.status == ConversionStatus.PARTIAL_SUCCESS:
            _log.info(
                f"Document {conv_res.input.file} was partially converted with the following errors:"
            )
            for item in conv_res.errors:
                _log.info(f"\t{item.error_message}")
            partial_success_count += 1
        else:
            _log.info(f"Document {conv_res.input.file} failed to convert.")
            failure_count += 1

    _log.info(
        f"Processed {success_count + partial_success_count + failure_count} docs, "
        f"of which {failure_count} failed "
        f"and {partial_success_count} were partially converted."
    )
    return success_count, partial_success_count, failure_count


def main():
    logging.basicConfig(level=logging.INFO)

    input_doc_paths = map(lambda file: Path("../garbo_pdfs").joinpath(file), [
        # Path("garbo_pdfs/astra-zeneca-2023.pdf"),
        "Vestum-arsredovisning-2023.pdf"
    ])

    # buf = BytesIO(Path("./test/data/2206.01062.pdf").open("rb").read())
    # docs = [DocumentStream(name="my_doc.pdf", stream=buf)]
    # input = DocumentConversionInput.from_streams(docs)

    # # Turn on inline debug visualizations:
    # settings.debug.visualize_layout = True
    # settings.debug.visualize_ocr = True
    # settings.debug.visualize_tables = True
    # settings.debug.visualize_cells = True

    # Docling Parse with Tesseract
    pipeline_options = PdfPipelineOptions()

    pipeline_options.do_ocr = True
    pipeline_options.do_table_structure = True
    pipeline_options.table_structure_options.do_cell_matching = True
    # TODO: decide between ACCURATE and FAST modes
    # with accurate parsing: 108 tables on 42 unique pages - 300 seconds => 5 min
    # with fast parsing:	 108 tables on 42 unique pages - 175 seconds => 3 min
    pipeline_options.table_structure_options.mode = TableFormerMode.FAST
    pipeline_options.ocr_options = TesseractOcrOptions()

    pipeline_options.generate_table_images=True
    pipeline_options.generate_page_images=True
    pipeline_options.images_scale=1
    pipeline_options.ocr_options.lang = ["swe", "eng"]

    doc_converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    start_time = time.time()

    conv_results = doc_converter.convert_all(
        input_doc_paths,
        raises_on_error=False,  # to let conversion run through all and examine results at the end
    )
    success_count, partial_success_count, failure_count = export_documents(
        conv_results, output_dir=Path("scratch")
    )

    end_time = time.time() - start_time

    _log.info(f"Document conversion complete in {end_time:.2f} seconds.")

    if failure_count > 0:
        raise RuntimeError(
            f"The example failed converting {failure_count} on {len(input_doc_paths)}."
        )

if __name__ == "__main__":
    main()